import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("POST /categories/:id/presets (create modification preset)", () => {
    let jwks: JWKSMock;
    let stop: () => void;
    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });

    const seedCategory = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [],
            modificationPresets: [],
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
        it("201 → creates a radio preset & maps defaultOptionIndex to defaultOptionId", async () => {
            const t = admin();
            const cat = await seedCategory();

            const res = await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Crust Type",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                    defaultOptionIndex: 1,
                    isRequired: true,
                })
                .expect(201);

            const preset = res.body.category.modificationPresets.find((p: any) => p.name === "Crust Type");
            expect(preset).toBeTruthy();
            expect(preset.id).toBeTruthy();
            expect(preset.options).toHaveLength(2);
            expect(preset.defaultOptionId).toBeTruthy();
            expect(preset.options.some((o: any) => o.id === preset.defaultOptionId)).toBe(true);
        });

        it("201 → creates a checkbox preset with bounds", async () => {
            const t = admin();
            const cat = await seedCategory();

            const res = await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Add-ons",
                    kind: "checkbox",
                    options: [{ label: "Cheese" }, { label: "Jalapeño" }, { label: "Olives" }],
                    minSelected: 0,
                    maxSelected: 2,
                })
                .expect(201);

            const preset = res.body.category.modificationPresets.find((p: any) => p.name === "Add-ons");
            expect(preset.options.length).toBe(3);
            expect(preset.minSelected).toBe(0);
            expect(preset.maxSelected).toBe(2);
        });
    });

    describe("Validation errors", () => {
        it("400 → name required / options non-empty / kind valid", async () => {
            const t = admin();
            const cat = await seedCategory();

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "", kind: "radio", options: [{ label: "X" }] })
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X", kind: "bad", options: [{ label: "Y" }] })
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X", kind: "radio", options: [] })
                .expect(400);
        });

        it("400 → radio defaultOptionIndex out of range", async () => {
            const t = admin();
            const cat = await seedCategory();

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Bad",
                    kind: "radio",
                    options: [{ label: "A" }, { label: "B" }],
                    defaultOptionIndex: 5,
                })
                .expect(400);
        });

        it("400 → checkbox bounds invalid", async () => {
            const t = admin();
            const cat = await seedCategory();

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "BadBox",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }],
                    minSelected: 2,
                    maxSelected: 1,
                })
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "TooMany",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }],
                    minSelected: 0,
                    maxSelected: 5,
                })
                .expect(400);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 unauthenticated", async () => {
            const cat = await seedCategory();
            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .send({
                    name: "Crust Type",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                })
                .expect(401);
        });

        it("403 manager not allowed", async () => {
            const cat = await seedCategory();
            const t = manager();
            await request(app)
                .post(`/categories/${cat._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Crust Type",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                })
                .expect(403);
        });
    });

    describe("Not found / archived", () => {
        it("404 category not found", async () => {
            const t = admin();
            await request(app)
                .post(`/categories/66aabbccddeeff0011223344/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "X",
                    kind: "radio",
                    options: [{ label: "A" }],
                })
                .expect(404);
        });

        it("409 category archived", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Archived",
                attributes: [],
                modificationPresets: [],
                isDeleted: true,
                deletedAt: new Date(),
            });

            await request(app)
                .post(`/categories/${doc._id}/presets`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "X",
                    kind: "radio",
                    options: [{ label: "A" }],
                })
                .expect(409);
        });
    });
});
