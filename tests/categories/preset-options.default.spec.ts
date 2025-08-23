import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("POST /categories/:id/presets/:presetId/default (set preset default)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            modificationPresets: [
                {
                    name: "Crust",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                },
            ], // no default yet
            attributes: [],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedCheckbox = async () => {
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

    describe("Radio", () => {
        it("200 → set default to existing option id", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[1];

            const res = await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: opt.id })
                .expect(200);

            const upd = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(upd.defaultOptionId).toBe(opt.id);
        });

        it("200 → clear default with null", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Pasta",
                modificationPresets: [
                    {
                        name: "Sauce",
                        kind: "radio",
                        options: [{ label: "Red" }, { label: "White" }],
                        defaultOptionIndex: 0,
                    },
                ],
                attributes: [],
                isDeleted: false,
            }).then((d) => d.toObject());

            const preset = (doc as any).modificationPresets[0];

            const res = await request(app)
                .post(`/categories/${doc._id}/presets/${preset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(200);

            const upd = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            expect(upd.defaultOptionId).toBeUndefined();
        });

        it("404 → option not found or deleted", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: "not-there" })
                .expect(404);
        });
    });

    describe("Checkbox", () => {
        it("400 → checkbox presets do not support default (even null)", async () => {
            const t = admin();
            const cat = await seedCheckbox();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(400);
        });
    });

    describe("Not found / archived / auth", () => {
        it("404 preset/category not found; 409 archived", async () => {
            const t = admin();
            const cat = await seedRadio();

            await request(app)
                .post(`/categories/${cat._id}/presets/not-there/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(404);

            await request(app)
                .post(`/categories/66aabbccddeeff0011223344/presets/p1/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(404);

            const archived = await CategoryModel.create({
                name: "Archived",
                isDeleted: true,
                deletedAt: new Date(),
                modificationPresets: [
                    { name: "A", kind: "radio", options: [{ label: "x" }, { label: "y" }], defaultOptionIndex: 0 },
                ],
            }).then((d) => d.toObject());

            const archPreset = (archived as any).modificationPresets[0];
            await request(app)
                .post(`/categories/${archived._id}/presets/${archPreset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(409);
        });

        it("401 unauthenticated; 403 MANAGER not allowed", async () => {
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/default`)
                .send({ optionId: null })
                .expect(401);

            const t = manager();
            await request(app)
                .post(`/categories/${cat._id}/presets/${preset.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(403);
        });
    });
});
