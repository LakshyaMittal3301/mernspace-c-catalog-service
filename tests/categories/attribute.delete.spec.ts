import request from "supertest";
import mongoose from "mongoose";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("DELETE /categories/:id/attributes/:attrId (soft delete attribute)", () => {
    let jwks: JWKSMock;
    let stopJwks: () => void;
    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });
    const customer = () => jwks.token({ sub: "u3", role: Roles.CUSTOMER ?? "customer" });

    const seedWithAttr = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                {
                    name: "Size",
                    kind: "radio",
                    options: [{ label: "S" }, { label: "M" }, { label: "L" }],
                    defaultOptionIndex: 1,
                },
            ],
            modificationPresets: [],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedArchivedWithAttr = async () => {
        const doc = await CategoryModel.create({
            name: "Archived",
            attributes: [{ name: "A", kind: "checkbox", options: [{ label: "X" }] }],
            isDeleted: true,
            deletedAt: new Date(),
        });
        return doc.toObject();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_test");
        jwks = createJWKSMock("http://localhost:5501");
    });
    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();
    });
    afterEach(() => stopJwks());
    afterAll(async () => {
        await stopTestMongo();
    });

    describe("Happy path", () => {
        it("204 → marks attribute soft-deleted with deletedAt", async () => {
            const t = admin();
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const fresh = await CategoryModel.findById(cat._id).lean();
            const dbAttr: any = fresh!.attributes.find((a: any) => a.id === attr.id);
            expect(dbAttr.isDeleted).toBe(true);
            expect(dbAttr.deletedAt).toBeTruthy();
        });

        it("204 again if already deleted (idempotent)", async () => {
            const t = admin();
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];

            // first delete
            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            // second delete
            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);
        });
    });

    describe("Validation / error cases", () => {
        it("400 → invalid category id format", async () => {
            const t = admin();
            await request(app)
                .delete(`/categories/not-an-objectid/attributes/foo`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);
        });

        it("404 → category not found", async () => {
            const t = admin();
            const missing = new mongoose.Types.ObjectId().toHexString();
            await request(app)
                .delete(`/categories/${missing}/attributes/whatever`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("404 → attribute not found", async () => {
            const t = admin();
            const cat = await seedWithAttr();
            await request(app)
                .delete(`/categories/${cat._id}/attributes/not-present`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("409 → category archived", async () => {
            const t = admin();
            const cat = await seedArchivedWithAttr();
            const attr = (cat as any).attributes[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });

        it("400 → body must be empty", async () => {
            const t = admin();
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ anything: true })
                .expect(400);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 → unauthenticated", async () => {
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];
            await request(app).delete(`/categories/${cat._id}/attributes/${attr.id}`).expect(401);
        });

        it("401 → invalid token", async () => {
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];
            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", ["accessToken=not-a-jwt"])
                .expect(401);
        });

        it("403 → role not allowed", async () => {
            const t = customer();
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];
            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });
    });

    describe("Invariants", () => {
        it("does not hard-delete the attribute document", async () => {
            const t = admin();
            const cat = await seedWithAttr();
            const attr = (cat as any).attributes[0];

            await request(app)
                .delete(`/categories/${cat._id}/attributes/${attr.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const fresh = await CategoryModel.findById(cat._id).lean();
            const exists = fresh!.attributes.some((a: any) => a.id === attr.id);
            expect(exists).toBe(true); // still present, but soft-deleted
        });
    });
});
