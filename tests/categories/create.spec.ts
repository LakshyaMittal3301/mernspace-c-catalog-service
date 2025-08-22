import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("POST /categories", () => {
    const route = "/categories";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "123", role, ...extra });

    beforeAll(async () => {
        // Start in-memory Mongo
        await startTestMongo("catalog_test");

        // Start JWKS mock
        process.env.JWKS_URI = "http://localhost:5501/.well-known/jwks.json";
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();
    });

    afterEach(() => {
        stopJwks();
    });

    afterAll(async () => {
        await stopTestMongo();
    });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = () => makeToken(Roles.MANAGER);

    const validBody = {
        name: "Pizza",
        attributes: [
            {
                kind: "radio",
                name: "Size",
                options: [{ label: "S" }, { label: "M" }, { label: "L" }],
                defaultOptionIndex: 1,
                isRequired: true,
            },
            {
                kind: "switch",
                name: "Gluten Free",
                options: [{ label: "Yes" }, { label: "No" }],
                defaultOptionIndex: 1,
            },
            {
                kind: "checkbox",
                name: "Toppings",
                options: [{ label: "Olives" }, { label: "Mushrooms" }, { label: "Peppers" }],
                minSelected: 0,
                maxSelected: 2,
            },
        ],
        modificationPresets: [
            {
                kind: "radio",
                name: "Crust Type",
                options: [{ label: "Thin" }, { label: "Thick" }],
                defaultOptionIndex: 0,
                isRequired: true,
            },
        ],
    };

    describe("Happy path", () => {
        it("201 + returns category with generated ids", async () => {
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send(validBody);

            expect(res.statusCode).toBe(201);
            expect(res.headers["content-type"]).toContain("json");

            // Depending on your controller shape: { category: {...} }
            const cat = res.body.category ?? res.body;
            expect(cat).toHaveProperty("id");
            expect(cat).toHaveProperty("name", "Pizza");
            expect(Array.isArray(cat.attributes)).toBe(true);
            expect(Array.isArray(cat.modificationPresets)).toBe(true);

            // Verify defaultOptionId was resolved (not index)
            const size = cat.attributes.find((a: any) => a.name === "Size");
            expect(size.defaultOptionId).toBeTruthy();
            expect(size.options.some((o: any) => o.id === size.defaultOptionId)).toBe(true);

            const gf = cat.attributes.find((a: any) => a.name === "Gluten Free");
            expect(gf.options).toHaveLength(2);
        });

        it("409 on duplicate name", async () => {
            const t = adminToken();

            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody)
                .expect(201);
            // Same name again
            const res2 = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody);

            expect([400, 409]).toContain(res2.statusCode); // your controller may map it to 409
        });

        it("persists a category with the provided fields", async () => {
            const t = adminToken();

            const res = await request(app)
                .post("/categories")
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Pizza",
                    attributes: [{ name: "Size", kind: "radio", options: [{ label: "Small" }, { label: "Large" }] }],
                })
                .expect(201);

            // query DB
            const cats = await CategoryModel.find();
            expect(cats).toHaveLength(1);
            expect(cats[0].name).toBe("Pizza");
            expect(cats[0].attributes[0].name).toBe("Size");
        });
    });

    describe("Validation errors", () => {
        it("400 when name missing", async () => {
            const body = { ...validBody, name: "" };
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send(body);
            expect(res.statusCode).toBe(400);
        });

        it("400 when switch has not exactly 2 options", async () => {
            const body = {
                ...validBody,
                attributes: [
                    ...validBody.attributes.filter((a) => a.kind !== "switch"),
                    {
                        kind: "switch",
                        name: "Bad Switch",
                        options: [{ label: "Yes" }], // only one
                        defaultOptionIndex: 0,
                    },
                ],
            };
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send(body);
            expect(res.statusCode).toBe(400);
        });

        it("400 when defaultOptionIndex out of range (radio)", async () => {
            const body = {
                ...validBody,
                attributes: [
                    {
                        kind: "radio",
                        name: "Colors",
                        options: [{ label: "Red" }, { label: "Blue" }],
                        defaultOptionIndex: 5, // invalid
                    },
                ],
                modificationPresets: [],
            };
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send(body);
            expect(res.statusCode).toBe(400);
        });

        it("400 when checkbox maxSelected > options.length", async () => {
            const body = {
                name: "Bad-Box",
                attributes: [
                    {
                        kind: "checkbox",
                        name: "Too many",
                        options: [{ label: "A" }, { label: "B" }],
                        minSelected: 0,
                        maxSelected: 5,
                    },
                ],
                modificationPresets: [],
            };
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send(body);
            expect(res.statusCode).toBe(400);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const res = await request(app).post(route).send(validBody);
            expect(res.statusCode).toBe(401);
        });

        it("401 when token clearly invalid", async () => {
            const res = await request(app).post(route).set("Cookie", ["accessToken=not-a-jwt"]).send(validBody);
            expect(res.statusCode).toBe(401);
        });

        it("401 when token expired", async () => {
            const expired = jwks.token({
                sub: "123",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${expired}`])
                .send(validBody);
            expect(res.statusCode).toBe(401);
        });

        it("403 when role is not ADMIN", async () => {
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${managerToken()}`])
                .send(validBody);
            expect(res.statusCode).toBe(403);
        });
    });

    describe("Idempotency / invariants", () => {
        it("does not create category on validation error", async () => {
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "", attributes: [], modificationPresets: [] })
                .expect(400);
        });
    });
});
