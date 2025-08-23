import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("PATCH /categories/:id/presets/:presetId (update preset)", () => {
    let jwks: JWKSMock;
    let stop: () => void;
    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });

    const seedRadioPreset = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            modificationPresets: [
                {
                    name: "Crust",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                    defaultOptionIndex: 0,
                    isRequired: true,
                },
            ],
            attributes: [],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedCheckboxPreset = async () => {
        const doc = await CategoryModel.create({
            name: "Burger",
            modificationPresets: [
                {
                    name: "Add-ons",
                    kind: "checkbox",
                    options: [{ label: "Cheese" }, { label: "Onion" }, { label: "Tomato" }],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
            attributes: [],
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
        it("200 → rename preset", async () => {
            const t = admin();
            const cat = await seedRadioPreset();
            const preset = (cat as any).modificationPresets[0];

            const res = await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Dough" })
                .expect(200);

            const updated = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(updated.name).toBe("Dough");
        });

        it("200 → checkbox: update min/max within active options", async () => {
            const t = admin();
            const cat = await seedCheckboxPreset();
            const preset = (cat as any).modificationPresets[0];

            const res = await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ minSelected: 1, maxSelected: 2 })
                .expect(200);

            const updated = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(updated.minSelected).toBe(1);
            expect(updated.maxSelected).toBe(2);
        });
    });

    describe("Validation / business rules", () => {
        it("400 → body cannot be empty; only allowed keys", async () => {
            const t = admin();
            const cat = await seedRadioPreset();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ kind: "checkbox" })
                .expect(400);
        });

        it("400 → radio: min/max not allowed; checkbox: isRequired not allowed", async () => {
            const t = admin();
            const catRadio = await seedRadioPreset();
            const r = (catRadio as any).modificationPresets[0];

            await request(app)
                .patch(`/categories/${catRadio._id}/presets/${r.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ minSelected: 1 })
                .expect(400);

            const catBox = await seedCheckboxPreset();
            const c = (catBox as any).modificationPresets[0];

            await request(app)
                .patch(`/categories/${catBox._id}/presets/${c.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ isRequired: true })
                .expect(400);
        });

        it("400 → checkbox bounds invalid", async () => {
            const t = admin();
            const cat = await seedCheckboxPreset();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ minSelected: 3, maxSelected: 1 })
                .expect(400);
        });

        it("404/409 → missing or archived category, missing preset", async () => {
            const t = admin();

            await request(app)
                .patch(`/categories/66aabbccddeeff0011223344/presets/p1`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
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
                .patch(`/categories/${archived._id}/presets/${(archived as any).modificationPresets[0].id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
                .expect(409);

            const cat = await seedRadioPreset();
            await request(app)
                .patch(`/categories/${cat._id}/presets/not-there`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
                .expect(404);
        });
    });
});
