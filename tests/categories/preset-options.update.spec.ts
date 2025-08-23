import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("PATCH /categories/:id/presets/:presetId/options/:optId (rename preset option)", () => {
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
                    defaultOptionIndex: 1,
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
        it("200 → renames label; defaultOptionId stays with same option id", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[1]; // default

            const res = await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "Thick Classic" })
                .expect(200);

            const upd = res.body.category.modificationPresets.find((p: any) => p.id === preset.id);
            const updOpt = upd.options.find((o: any) => o.id === opt.id);
            expect(updOpt.label).toBe("Thick Classic");
            expect(upd.defaultOptionId).toBe(opt.id);
        });
    });

    describe("Validation / errors", () => {
        it("400 → empty body / label empty / extra fields", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[0];

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "" })
                .expect(400);

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "Ok", id: "hack" })
                .expect(400);
        });

        it("404 → option/preset/category not found; 409 archived category", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/not-here`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);

            await request(app)
                .patch(`/categories/${cat._id}/presets/not-there/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);

            await request(app)
                .patch(`/categories/66aabbccddeeff0011223344/presets/p1/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
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
                .patch(`/categories/${archived._id}/presets/${archPreset.id}/options/${archPreset.options[0].id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(409);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 → unauthenticated", async () => {
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[0];
            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .send({ label: "X" })
                .expect(401);
        });

        it("403 → MANAGER not allowed", async () => {
            const t = manager();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[0];
            await request(app)
                .patch(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(403);
        });
    });
});
