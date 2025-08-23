import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { CategoryModel } from "../../src/categories/category.model";
import { Roles } from "../../src/common/constants";

describe("POST /categories/:id/attributes/:attrId/options (add options)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });
    const customer = () => jwks.token({ sub: "u3", role: Roles.CUSTOMER ?? "customer" });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                {
                    name: "Size",
                    kind: "radio",
                    options: [{ label: "S" }, { label: "M" }],
                    defaultOptionIndex: 1,
                    isRequired: true,
                },
            ],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedCheckbox = async () => {
        const doc = await CategoryModel.create({
            name: "Burger",
            attributes: [
                {
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "Cheese" }, { label: "Lettuce" }],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedSwitch = async () => {
        const doc = await CategoryModel.create({
            name: "Pasta",
            attributes: [
                {
                    name: "Gluten Free",
                    kind: "switch",
                    options: [{ label: "Yes" }, { label: "No" }],
                    defaultOptionIndex: 0,
                },
            ],
            isDeleted: false,
        });
        return doc.toObject();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_test");
        jwks = createJWKSMock("http://localhost:5501");
    });
    beforeEach(async () => {
        stop = jwks.start();
        await clearTestMongo();
    });
    afterEach(() => stop());
    afterAll(async () => {
        await stopTestMongo();
    });

    describe("Happy path", () => {
        it("200 → adds options to radio", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "L" }, { label: "XL" }] })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            expect(updated.options.length).toBe(4);
            expect(updated.options.some((o: any) => o.label === "XL")).toBe(true);
        });

        it("200 → adds options to checkbox and preserves min/max invariants", async () => {
            const t = admin();
            const cat = await seedCheckbox();
            const attr = (cat as any).attributes[0];

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Tomato" }] })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            expect(updated.options.length).toBe(3);
            expect(updated.minSelected).toBe(0);
            expect(updated.maxSelected).toBe(2);
        });
    });

    describe("Validation / business rules", () => {
        it("400 → body must contain non-empty options array", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [] })
                .expect(400);
        });

        it("400 → label must be non-empty string", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "" }] })
                .expect(400);
        });

        it("400 → cannot add more than 2 active options to switch", async () => {
            const t = admin();
            const cat = await seedSwitch();
            const attr = (cat as any).attributes[0];

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Maybe" }] })
                .expect(400);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 unauthenticated", async () => {
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .send({ options: [{ label: "XL" }] })
                .expect(401);
        });

        it("403 unauthorized role", async () => {
            const t = customer();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "XL" }] })
                .expect(403);
        });
    });

    describe("Not found / archived", () => {
        it("404 when attribute not found", async () => {
            const t = admin();
            const cat = await seedRadio();
            await request(app)
                .post(`/categories/${cat._id}/attributes/not-there/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "XL" }] })
                .expect(404);
        });

        it("404 when category not found", async () => {
            const t = admin();
            await request(app)
                .post(`/categories/66aabbccddeeff0011223344/attributes/attr/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "XL" }] })
                .expect(404);
        });

        it("409 when category archived", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Archived",
                attributes: [{ name: "A", kind: "radio", options: [{ label: "X" }, { label: "Y" }] }],
                isDeleted: true,
                deletedAt: new Date(),
            });
            const attr = (doc.toObject() as any).attributes[0];
            await request(app)
                .post(`/categories/${doc._id}/attributes/${attr.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Z" }] })
                .expect(409);
        });
    });
});
