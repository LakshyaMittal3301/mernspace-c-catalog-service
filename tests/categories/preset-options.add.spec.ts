import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("POST /categories/:id/presets/:presetId/options (add preset options)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [],
            modificationPresets: [
                {
                    name: "Crust",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                    defaultOptionIndex: 0,
                    isRequired: true,
                },
            ],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedCheckbox = async () => {
        const doc = await CategoryModel.create({
            name: "Sandwich",
            attributes: [],
            modificationPresets: [
                {
                    name: "Add-ons",
                    kind: "checkbox",
                    options: [{ label: "Cheese" }, { label: "Tomato" }],
                    minSelected: 0,
                    maxSelected: 2,
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
        it("200 → adds options to radio preset", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            const res = await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Stuffed" }, { label: "Whole Wheat" }] })
                .expect(200);

            const updated = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(updated.options.length).toBe(4);
            expect(updated.options.some((o: any) => o.label === "Stuffed")).toBe(true);
        });

        it("200 → adds options to checkbox preset", async () => {
            const t = admin();
            const cat = await seedCheckbox();
            const preset = (cat as any).modificationPresets[0];

            const res = await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Lettuce" }] })
                .expect(200);

            const updated = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(updated.options.length).toBe(3);
            expect(updated.minSelected).toBe(0);
            expect(updated.maxSelected).toBe(2);
        });
    });

    describe("Validation / errors", () => {
        it("400 → body must be { options: [...] } and non-empty", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [] })
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "" }] })
                .expect(400);

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Ok" }], extra: true })
                .expect(400);
        });

        it("404 → preset not found / category not found; 409 → archived category", async () => {
            const t = admin();
            const cat = await seedRadio();

            await request(app)
                .post(`/categories/${cat._id}/presets/not-there/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X" }] })
                .expect(404);

            await request(app)
                .post(`/categories/66aabbccddeeff0011223344/presets/p1/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X" }] })
                .expect(404);

            const archived = await CategoryModel.create({
                name: "Archived",
                isDeleted: true,
                deletedAt: new Date(),
                modificationPresets: [
                    { name: "A", kind: "radio", options: [{ label: "x" }, { label: "y" }], defaultOptionIndex: 0 },
                ],
            }).then((d) => d.toObject());

            await request(app)
                .post(`/categories/${archived._id}/presets/${(archived as any).modificationPresets[0].id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Z" }] })
                .expect(409);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 → unauthenticated", async () => {
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .send({ options: [{ label: "X" }] })
                .expect(401);
        });

        it("403 → MANAGER not allowed (ADMIN only)", async () => {
            const t = manager();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/options`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X" }] })
                .expect(403);
        });
    });
});
