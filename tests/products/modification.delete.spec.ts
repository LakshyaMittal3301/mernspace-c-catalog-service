import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("DELETE /products/:id/modifications/:modId", () => {
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    const seedProduct = async (tenantId = "t-001") => {
        const baseOptId = "opt-base-1";
        const doc = await ProductModel.create({
            tenantId,
            name: "Seed Product",
            description: "Seed",
            categoryId: "cat-1",
            attributeValues: [],
            modifications: [
                {
                    id: "mod-base",
                    name: "Base",
                    kind: "radio",
                    isBase: true,
                    options: [{ id: baseOptId, label: "Standard", price: 1000 }],
                    defaultOptionId: baseOptId,
                },
                {
                    id: "mod-side",
                    name: "Sides",
                    kind: "checkbox",
                    options: [
                        { id: "s1", label: "Fries", price: 200 },
                        { id: "s2", label: "Salad", price: 250 },
                    ],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
            status: "active",
            isDeleted: false,
        });
        return await ProductModel.findById(doc._id).lean();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_products_mod_delete_test");
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
        it("204 soft-deletes a non-base modification", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const persisted = await ProductModel.findById(seed!._id).lean();
            const side = (persisted!.modifications as any[]).find((m: any) => m.id === "mod-side");
            expect(side.isDeleted).toBe(true);
            expect(side.deletedAt).toBeTruthy();
        });

        it("204 is idempotent when already deleted", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);
        });
    });

    describe("Business rules", () => {
        it("409 cannot delete the base radio modification", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });

        it("404 when modification not found", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            await request(app)
                .delete(`/products/${seed!._id}/modifications/nope`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("404 when product not found", async () => {
            const t = adminToken();
            const fakeId = "64a9f7f4bb2c2a0b4a2b1c22";
            await request(app)
                .delete(`/products/${fakeId}/modifications/mod-1`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const seed = await seedProduct();
            await request(app).delete(`/products/${seed!._id}/modifications/mod-side`).expect(401);
        });

        it("403 when MANAGER deletes other tenant's product", async () => {
            const seed = await seedProduct("tenant-A");
            const t = managerToken("tenant-B");
            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });

        it("409 (ADMIN) vs 404 (MANAGER) when product archived", async () => {
            const seed = await seedProduct();
            await ProductModel.updateOne({ _id: seed!._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(409);

            await request(app)
                .delete(`/products/${seed!._id}/modifications/mod-side`)
                .set("Cookie", [`accessToken=${managerToken()}`])
                .expect(404);
        });
    });
});
