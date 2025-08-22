// tests/categories/update.spec.ts
import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("PATCH /categories/:id", () => {
    const baseRoute = "/categories";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "user-1", role, ...extra });

    beforeAll(async () => {
        await startTestMongo("catalog_update_tests");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();
    });

    afterEach(() => stopJwks());
    afterAll(async () => stopTestMongo());

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = () => makeToken(Roles.MANAGER);

    const createCategory = async (name = "Pizza") => {
        const res = await request(app)
            .post(baseRoute)
            .set("Cookie", [`accessToken=${adminToken()}`])
            .send({
                name,
                attributes: [
                    {
                        kind: "radio",
                        name: "Size",
                        options: [{ label: "S" }, { label: "M" }],
                        defaultOptionIndex: 1,
                    },
                ],
                modificationPresets: [],
            })
            .expect(201);

        return res.body.category ?? res.body; // depending on controller shape
    };

    describe("Happy path", () => {
        it("200 returns updated category and persists change", async () => {
            const created = await createCategory("Pizza");
            const id = created.id;

            const res = await request(app)
                .patch(`${baseRoute}/${id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Pizza Updated" })
                .expect(200);

            const cat = res.body.category ?? res.body;
            expect(cat.name).toBe("Pizza Updated");
            expect(res.headers["content-type"]).toContain("json");

            const inDb = await CategoryModel.findById(id).lean();
            expect(inDb?.name).toBe("Pizza Updated");
        });

        it("200 when setting the same name (no-op update)", async () => {
            const created = await createCategory("Drinks");
            const id = created.id;

            const res = await request(app)
                .patch(`${baseRoute}/${id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Drinks" })
                .expect(200);

            const cat = res.body.category ?? res.body;
            expect(cat.name).toBe("Drinks");
        });

        it("200 when renaming to a name used by a soft-deleted category (partial unique index)", async () => {
            const active = await createCategory("Active");
            const archived = await createCategory("ArchivedName");

            // Soft-delete the second one directly (DELETE endpoint may exist later)
            await CategoryModel.findByIdAndUpdate(archived.id, {
                isDeleted: true,
                deletedAt: new Date(),
            });

            const res = await request(app)
                .patch(`${baseRoute}/${active.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "ArchivedName" })
                .expect(200);

            const cat = res.body.category ?? res.body;
            expect(cat.name).toBe("ArchivedName");

            const inDb = await CategoryModel.findById(active.id).lean();
            expect(inDb?.name).toBe("ArchivedName");
        });
    });

    describe("Validation errors", () => {
        it("400 when body is empty", async () => {
            const created = await createCategory("Soups");

            const res = await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(400);

            expect(res.body).toHaveProperty("errors");
        });

        it("400 when name is blank/whitespace after trim", async () => {
            const created = await createCategory("Salads");

            const res = await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "   " })
                .expect(400);

            expect(res.body).toHaveProperty("errors");
        });

        it("400 when trying to set forbidden fields (isDeleted/deletedAt)", async () => {
            const created = await createCategory("Snacks");

            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ isDeleted: true })
                .expect(400);

            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ deletedAt: new Date().toISOString() })
                .expect(400);
        });

        it("409 when renaming to an existing active category name", async () => {
            const c1 = await createCategory("One");
            await createCategory("Two");

            const res = await request(app)
                .patch(`${baseRoute}/${c1.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Two" });

            expect([409, 400]).toContain(res.statusCode); // controller may map duplicate to 409
        });
    });

    describe("Not found / archived", () => {
        it("400 when id is not a valid ObjectId", async () => {
            const res = await request(app)
                .patch(`${baseRoute}/not-a-valid-id`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Anything" })
                .expect(400);

            expect(res.body).toHaveProperty("errors");
        });

        it("404 when id is valid ObjectId but category does not exist", async () => {
            const res = await request(app)
                .patch(`${baseRoute}/64d23b9e3d5e4e0012345678`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Nope" })
                .expect(404);

            // optional: check message contains "not found"
            expect(JSON.stringify(res.body).toLowerCase()).toContain("not");
        });

        it("409 when category is archived (soft-deleted)", async () => {
            const created = await createCategory("Archived Test");

            await CategoryModel.findByIdAndUpdate(created.id, {
                isDeleted: true,
                deletedAt: new Date(),
            });

            const res = await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Should Fail" })
                .expect([409, 404]); // per your controller; recommended = 409

            // Ensure DB unchanged
            const inDb = await CategoryModel.findById(created.id).lean();
            expect(inDb?.name).toBe("Archived Test");
            expect(inDb?.isDeleted).toBe(true);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const created = await createCategory("Public");
            await request(app).patch(`${baseRoute}/${created.id}`).send({ name: "NoAuth" }).expect(401);
        });

        it("401 when token is clearly invalid", async () => {
            const created = await createCategory("InvalidToken");
            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({ name: "Nope" })
                .expect(401);
        });

        it("401 when token is expired", async () => {
            const created = await createCategory("ExpiredToken");
            const expired = jwks.token({
                sub: "user-1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });

            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${expired}`])
                .send({ name: "Nope" })
                .expect(401);
        });

        it("403 when role is not ADMIN", async () => {
            const created = await createCategory("ManagerBlocked");
            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${managerToken()}`])
                .send({ name: "NotAllowed" })
                .expect(403);
        });
    });

    describe("Invariants", () => {
        it("does not change DB on validation error (empty body)", async () => {
            const created = await createCategory("Invariant");
            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(400);

            const inDb = await CategoryModel.findById(created.id).lean();
            expect(inDb?.name).toBe("Invariant");
        });

        it("does not change DB on forbidden fields", async () => {
            const created = await createCategory("Invariant2");
            await request(app)
                .patch(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ isDeleted: true })
                .expect(400);

            const inDb = await CategoryModel.findById(created.id).lean();
            expect(inDb?.isDeleted).toBe(false);
            expect(inDb?.name).toBe("Invariant2");
        });
    });
});
