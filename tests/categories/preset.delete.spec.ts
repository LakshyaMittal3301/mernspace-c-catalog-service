import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("DELETE /categories/:id/presets/:presetId (soft delete preset)", () => {
    let jwks: JWKSMock;
    let stop: () => void;
    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });

    const seedPreset = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            modificationPresets: [
                {
                    name: "Crust",
                    kind: "radio",
                    options: [{ label: "Thin" }, { label: "Thick" }],
                    defaultOptionIndex: 0,
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

    it("204 → soft-deletes preset; idempotent", async () => {
        const t = admin();
        const cat = await seedPreset();
        const preset = (cat as any).modificationPresets[0];

        await request(app)
            .delete(`/categories/${cat._id}/presets/${preset.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .expect(204);

        // again idempotent
        await request(app)
            .delete(`/categories/${cat._id}/presets/${preset.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .expect(204);

        const fresh = await CategoryModel.findById(cat._id).lean();
        const dbPreset: any = fresh!.modificationPresets.find((p: any) => p.id === preset.id);
        expect(dbPreset.isDeleted).toBe(true);
        expect(dbPreset.deletedAt).toBeTruthy();
    });

    it("404/409/400 as appropriate", async () => {
        const t = admin();

        // 404 category
        await request(app)
            .delete(`/categories/66aabbccddeeff0011223344/presets/p1`)
            .set("Cookie", [`accessToken=${t}`])
            .expect(404);

        // 409 archived
        const archived = await CategoryModel.create({
            name: "Archived",
            isDeleted: true,
            deletedAt: new Date(),
            modificationPresets: [
                { name: "A", kind: "radio", options: [{ label: "x" }, { label: "y" }], defaultOptionIndex: 0 },
            ],
        }).then((d) => d.toObject());

        await request(app)
            .delete(`/categories/${archived._id}/presets/${(archived as any).modificationPresets[0].id}`)
            .set("Cookie", [`accessToken=${t}`])
            .expect(409);

        // 404 preset not found
        const active = await seedPreset();
        await request(app)
            .delete(`/categories/${active._id}/presets/not-there`)
            .set("Cookie", [`accessToken=${t}`])
            .expect(404);

        // 400 body must be empty
        const preset = (active as any).modificationPresets[0];
        await request(app)
            .delete(`/categories/${active._id}/presets/${preset.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ something: true })
            .expect(400);
    });
});
