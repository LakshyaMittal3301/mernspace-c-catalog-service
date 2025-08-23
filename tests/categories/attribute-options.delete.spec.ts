import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { CategoryModel } from "../../src/categories/category.model";
import { Roles } from "../../src/common/constants";

describe("DELETE /categories/:id/attributes/:attrId/options/:optId (soft delete option)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                { name: "Size", kind: "radio", options: [{ label: "S" }, { label: "M" }], defaultOptionIndex: 1 },
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
        it("204 → soft deletes radio option; clears default if it was default", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const defaultOpt = attr.options[1]; // M is default

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}/options/${defaultOpt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const fresh = await CategoryModel.findById(cat._id).lean();
            const dbAttr: any = fresh!.attributes.find((a: any) => a.id === attr.id);
            const deleted = dbAttr.options.find((o: any) => o.id === defaultOpt.id);
            expect(deleted.isDeleted).toBe(true);
            expect(dbAttr.defaultOptionId).toBeUndefined();
        });

        it("204 again if already deleted (idempotent)", async () => {
            const t = manager();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);
        });
    });

    describe("Switch-specific rules", () => {
        it("400 → cannot delete an option if it would leave <2 active options for switch", async () => {
            const t = admin();
            const cat = await seedSwitch();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);
        });
    });

    describe("Validation / not found", () => {
        it("404 → option not found", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}/options/not-there`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("404 → attribute not found", async () => {
            const t = admin();
            const cat = await seedRadio();

            await request(app)
                .delete(`/categories/${cat._id}/attributes/not-there/options/whatever`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("404 → category not found", async () => {
            const t = admin();

            await request(app)
                .delete(`/categories/66aabbccddeeff0011223344/attributes/attr/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("409 → category archived", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Archived",
                attributes: [
                    { name: "A", kind: "radio", options: [{ label: "X" }, { label: "Y" }], defaultOptionIndex: 0 },
                ],
                isDeleted: true,
                deletedAt: new Date(),
            });
            const attr = (doc.toObject() as any).attributes[0];
            const opt = attr.options[0];

            await request(app)
                .delete(`/categories/${doc._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });
    });
});
