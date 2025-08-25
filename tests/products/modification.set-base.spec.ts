import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";
import mongoose from "mongoose";

describe("POST /products/:id/modifications/:modId/base", () => {
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    beforeAll(async () => {
        await startTestMongo("catalog_products_set_base_test");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();
    });

    afterEach(() => {
        stopJwks();
    });

    afterAll(async () => {
        await stopTestMongo();
    });

    /**
     * Seed a minimal valid product:
     * - One base radio ("mod-base") with options + default
     * - One non-base radio ("mod-r2") with options, no default
     * - One checkbox group ("mod-check")
     */
    async function seedProduct(tenantId = "t-001") {
        const doc = await ProductModel.create({
            tenantId,
            name: "Seed Pizza",
            description: "with base and extras",
            categoryId: new mongoose.Types.ObjectId().toString(),
            attributeValues: [],
            status: "active",
            isDeleted: false,
            modifications: [
                {
                    id: "mod-base",
                    kind: "radio",
                    name: "Base Price",
                    isBase: true,
                    options: [
                        { id: "opt-b1", label: "Small", price: 10000 },
                        { id: "opt-b2", label: "Large", price: 20000 },
                    ],
                    defaultOptionIndex: 0, // model maps to defaultOptionId
                },
                {
                    id: "mod-r2",
                    kind: "radio",
                    name: "Second Radio",
                    isBase: false,
                    options: [
                        { id: "opt-r2a", label: "A", price: 0 },
                        { id: "opt-r2b", label: "B", price: 500 },
                    ],
                    // no defaultOptionId
                },
                {
                    id: "mod-check",
                    kind: "checkbox",
                    name: "Extras",
                    options: [
                        { id: "opt-c1", label: "Olives", price: 1000 },
                        { id: "opt-c2", label: "Cheese", price: 1500 },
                    ],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
        });

        return await ProductModel.findById(doc._id).lean();
    }

    const route = (id: string, modId: string) => `/products/${id}/modifications/${modId}/base`;

    describe("Happy path", () => {
        it("200 (ADMIN) switches base to target radio; ensures defaultOptionId; unsets previous base", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            // Pre-assertions
            const preBase = (p!.modifications as any[]).find((m) => m.id === "mod-base");
            const preR2 = (p!.modifications as any[]).find((m) => m.id === "mod-r2");
            expect(preBase.isBase).toBe(true);
            expect(preR2.isBase).toBe(false);
            expect(preR2.defaultOptionId).toBeUndefined(); // ensure service will auto-set

            const res = await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(200);

            const product = res.body.product ?? res.body;
            expect(product).toBeTruthy();

            const newBase = product.modifications.find((m: any) => m.id === "mod-r2");
            const oldBase = product.modifications.find((m: any) => m.id === "mod-base");
            expect(newBase.isBase).toBe(true);
            expect(newBase.kind).toBe("radio");
            expect(newBase.defaultOptionId).toBeTruthy(); // auto-set to first active
            expect(oldBase.isBase).toBe(false);

            // Persisted check
            const persisted = await ProductModel.findById(p!._id).lean();
            const persNewBase = (persisted!.modifications as any[]).find((m) => m.id === "mod-r2");
            const persOldBase = (persisted!.modifications as any[]).find((m) => m.id === "mod-base");
            expect(persNewBase!.isBase).toBe(true);
            expect(persOldBase!.isBase).toBe(false);
        });

        it("200 idempotent when target is already base", async () => {
            const p = await seedProduct("tenant-1");

            // First switch base to r2
            await ProductModel.updateOne(
                { _id: p!._id, "modifications.id": "mod-r2" },
                { $set: { "modifications.$.isBase": true, "modifications.$.defaultOptionId": "opt-r2a" } },
            );
            // And unset the previous base
            await ProductModel.updateOne(
                { _id: p!._id, "modifications.id": "mod-base" },
                { $set: { "modifications.$.isBase": false } },
            );

            const t = adminToken();
            const res = await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(200);

            const product = res.body.product ?? res.body;
            const r2 = product.modifications.find((m: any) => m.id === "mod-r2");
            expect(r2.isBase).toBe(true);
        });
    });

    describe("Validation / domain errors", () => {
        it("400 when target modification is checkbox (not radio)", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route(String(p!._id), "mod-check"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);
        });

        it("400 when target modification is soft-deleted", async () => {
            const p = await seedProduct("tenant-1");
            await ProductModel.updateOne(
                { _id: p!._id, "modifications.id": "mod-r2" },
                { $set: { "modifications.$.isDeleted": true } },
            );

            const t = adminToken();
            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);
        });

        it("404 when product not found", async () => {
            const t = adminToken();
            const fakeId = new mongoose.Types.ObjectId().toString();
            await request(app)
                .post(route(fakeId, "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(404);
        });

        it("404 when modification id not found on product", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();
            await request(app)
                .post(route(String(p!._id), "no-such-mod"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(404);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const p = await seedProduct("tenant-1");
            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .send({})
                .expect(401);
        });

        it("401 when token invalid", async () => {
            const p = await seedProduct("tenant-1");
            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({})
                .expect(401);
        });

        it("401 when token expired", async () => {
            const p = await seedProduct("tenant-1");
            const expired = jwks.token({
                sub: "u1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });

            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${expired}`])
                .send({})
                .expect(401);
        });

        it("403 when MANAGER tries to modify product of another tenant", async () => {
            const p = await seedProduct("tenant-1");
            const t = managerToken("tenant-OTHER");

            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(403);
        });

        it("409 (ADMIN) / 404 (MANAGER) when product is archived", async () => {
            // Admin
            const p1 = await seedProduct("tenant-1");
            await ProductModel.updateOne({ _id: p1!._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .post(route(String(p1!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(409);

            // Manager sees 404
            const p2 = await seedProduct("tenant-2");
            await ProductModel.updateOne({ _id: p2!._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .post(route(String(p2!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${managerToken("tenant-2")}`])
                .send({})
                .expect(404);
        });
    });

    describe("Validator", () => {
        it("400 when body is not empty", async () => {
            const p = await seedProduct("tenant-1");
            await request(app)
                .post(route(String(p!._id), "mod-r2"))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ unexpected: "field" })
                .expect(400);
        });

        it("400 when product id is not a valid ObjectId", async () => {
            await request(app)
                .post(route("not-an-objectid", "mod-r2"))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(400);
        });

        it("400 when modId param is empty", async () => {
            const p = await seedProduct("tenant-1");
            // missing modId path segment -> will 404 route, so we simulate empty via validator by passing single slash:
            await request(app)
                .post(`/products/${String(p!._id)}/modifications//base`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(404); // route not found; actual empty string cannot hit the route
        });
    });
});
