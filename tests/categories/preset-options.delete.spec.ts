import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("DELETE /categories/:id/presets/:presetId/options/:optId (soft delete preset option)", () => {
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

    const seedCheckboxMax2 = async () => {
        const doc = await CategoryModel.create({
            name: "Burger",
            modificationPresets: [
                {
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "Cheese" }, { label: "Onion" }],
                    minSelected: 0,
                    maxSelected: 2, // equals active options (2)
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
        it("204 → soft deletes radio option and clears default if it was default; idempotent", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const defaultOpt = preset.options[1];

            // first delete
            await request(app)
                .delete(`/categories/${cat._id}/presets/${preset.id}/options/${defaultOpt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            // again idempotent
            await request(app)
                .delete(`/categories/${cat._id}/presets/${preset.id}/options/${defaultOpt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const fresh = await CategoryModel.findById(cat._id).lean();
            const dbPreset: any = fresh!.modificationPresets.find((p: any) => p.id === preset.id);
            const deletedOpt = dbPreset.options.find((o: any) => o.id === defaultOpt.id);
            expect(deletedOpt.isDeleted).toBe(true);
            expect(dbPreset.defaultOptionId).toBeUndefined();
        });
    });

    describe("Checkbox constraints", () => {
        it("400 → deleting would violate maxSelected ≤ activeOptions", async () => {
            const t = admin();
            const cat = await seedCheckboxMax2();
            const preset = (cat as any).modificationPresets[0];
            const anyOpt = preset.options[0];

            await request(app)
                .delete(`/categories/${cat._id}/presets/${preset.id}/options/${anyOpt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);
        });
    });

    describe("Validation / not found / archived", () => {
        it("404 option/preset/category not found; 409 archived", async () => {
            const t = admin();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];

            await request(app)
                .delete(`/categories/${cat._id}/presets/${preset.id}/options/not-there`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);

            await request(app)
                .delete(`/categories/${cat._id}/presets/not-there/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);

            await request(app)
                .delete(`/categories/66aabbccddeeff0011223344/presets/p1/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
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
                .delete(`/categories/${archived._id}/presets/${archPreset.id}/options/${archPreset.options[0].id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 unauthenticated", async () => {
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[0];
            await request(app).delete(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`).expect(401);
        });

        it("403 MANAGER not allowed", async () => {
            const t = manager();
            const cat = await seedRadio();
            const preset = (cat as any).modificationPresets[0];
            const opt = preset.options[0];
            await request(app)
                .delete(`/categories/${cat._id}/presets/${preset.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });
    });
});
