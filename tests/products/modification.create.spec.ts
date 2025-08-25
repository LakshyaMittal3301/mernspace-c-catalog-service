import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("PATCH /products/:id/modifications/:modId", () => {
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
                    isRequired: true,
                },
                {
                    id: "mod-cheese",
                    name: "Cheese",
                    kind: "checkbox",
                    options: [
                        { id: "c1", label: "Extra Cheese", price: 300 },
                        { id: "c2", label: "Double Cheese", price: 500 },
                    ],
                    minSelected: 0,
                    maxSelected: 1,
                },
            ],
            status: "active",
            isDeleted: false,
        });
        return await ProductModel.findById(doc._id).lean();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_products_mod_update_test");
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
        it("200 updates radio group metadata (name, isRequired)", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            const res = await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Base Price", isRequired: false })
                .expect(200);

            const product = res.body.product ?? res.body;
            const base = product.modifications.find((m: any) => m.id === "mod-base");
            expect(base.name).toBe("Base Price");
            expect(base.isRequired).toBe(false);
        });

        it("200 updates checkbox min/max", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            const res = await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ minSelected: 0, maxSelected: 2 })
                .expect(200);

            const product = res.body.product ?? res.body;
            const g = product.modifications.find((m: any) => m.id === "mod-cheese");
            expect(g.minSelected).toBe(0);
            expect(g.maxSelected).toBe(2);
        });
    });

    describe("Validation / business rules", () => {
        it("400 when body empty", async () => {
            const seed = await seedProduct();
            const t = adminToken();
            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);
        });

        it("400 forbids changing kind/isBase/options/defaultOptionId", async () => {
            const seed = await seedProduct();
            const t = adminToken();

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ kind: "checkbox" })
                .expect(400);

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ isBase: false })
                .expect(400);

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [] })
                .expect(400);

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-base`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ defaultOptionId: "x" })
                .expect(400);
        });

        it("400 when checkbox maxSelected exceeds active options (model validation)", async () => {
            const seed = await seedProduct();
            const t = adminToken();
            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ maxSelected: 99 })
                .expect(400);
        });

        it("404 when modification not found", async () => {
            const seed = await seedProduct();
            const t = adminToken();
            await request(app)
                .patch(`/products/${seed!._id}/modifications/not-there`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
                .expect(404);
        });

        it("404 when product not found", async () => {
            const t = adminToken();
            const fakeId = "64a9f7f4bb2c2a0b4a2b1c22";
            await request(app)
                .patch(`/products/${fakeId}/modifications/mod-1`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
                .expect(404);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const seed = await seedProduct();
            await request(app).patch(`/products/${seed!._id}/modifications/mod-cheese`).send({ name: "X" }).expect(401);
        });

        it("403 when MANAGER edits other tenant's product", async () => {
            const seed = await seedProduct("tenant-A");
            const t = managerToken("tenant-B");
            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "X" })
                .expect(403);
        });

        it("409 (ADMIN) vs 404 (MANAGER) when product archived", async () => {
            const seed = await seedProduct();
            await ProductModel.updateOne({ _id: seed!._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "X" })
                .expect(409);

            await request(app)
                .patch(`/products/${seed!._id}/modifications/mod-cheese`)
                .set("Cookie", [`accessToken=${managerToken()}`])
                .send({ name: "X" })
                .expect(404);
        });
    });
});
