import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("PATCH /products/:id/modifications/:modId/options/:optId (update option)", () => {
    const route = (id: string, modId: string, optId: string) =>
        `/products/${id}/modifications/${modId}/options/${optId}`;

    let jwks: JWKSMock;
    let stopJwks: () => void;
    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });
    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    const seedProduct = async (tenantId = "t-001") => {
        const doc = await ProductModel.create({
            tenantId,
            name: "Calzone",
            description: "seed",
            categoryId: "cat-1",
            attributeValues: [],
            status: "active",
            modifications: [
                {
                    id: "mod-base",
                    kind: "radio",
                    name: "Base",
                    isBase: true,
                    options: [
                        { id: "opt-base-a", label: "Small", price: 10000 },
                        { id: "opt-base-b", label: "Large", price: 15000 },
                    ],
                    defaultOptionId: "opt-base-a",
                },
                {
                    id: "mod-c1",
                    kind: "checkbox",
                    name: "Toppings",
                    options: [
                        { id: "opt-c1a", label: "Olives", price: 2000 },
                        { id: "opt-c1b", label: "Mushrooms", price: 2500 },
                    ],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
        });
        return doc;
    };

    beforeAll(async () => {
        await startTestMongo("catalog_mod_opt_update");
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
        it("200 updates label and price; persists", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "Green Olives", price: 2200 })
                .expect(200);

            const persisted = await ProductModel.findById(p._id).lean();
            const c1 = (persisted!.modifications as any[]).find((m) => m.id === "mod-c1");
            const opt = c1.options.find((o: any) => o.id === "opt-c1a");
            expect(opt.label).toBe("Green Olives");
            expect(opt.price).toBe(2200);
        });

        it("200 (MANAGER) updates option in own tenant; 403 for other tenant", async () => {
            const myTenant = "t-mgr";
            const mine = await seedProduct(myTenant);
            const other = await seedProduct("t-other");
            const t = managerToken(myTenant);

            await request(app)
                .patch(route(String(mine._id), "mod-base", "opt-base-a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ price: 11000 })
                .expect(200);

            await request(app)
                .patch(route(String(other._id), "mod-base", "opt-base-a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ price: 11000 })
                .expect(403);
        });
    });

    describe("Validation / invariants", () => {
        it("400 when body empty or price negative", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ price: -1 })
                .expect(400);
        });

        it("404 when product/mod/option not found; 400 when option archived", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .patch(route("64b9b1f4c7a3b2a1f1f1f1f1", "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);

            await request(app)
                .patch(route(String(p._id), "nope", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);

            await request(app)
                .patch(route(String(p._id), "mod-c1", "nope"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);

            // archive option (native driver to bypass discriminator casting)
            await ProductModel.collection.updateOne(
                { _id: p._id, "modifications.id": "mod-c1" },
                {
                    $set: {
                        "modifications.$[m].options.$[o].isDeleted": true,
                        "modifications.$[m].options.$[o].deletedAt": new Date(),
                    },
                },
                { arrayFilters: [{ "m.id": "mod-c1" }, { "o.id": "opt-c1a" }] },
            );

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(400);
        });

        it("409 (ADMIN) / 404 (MANAGER) when product archived", async () => {
            const p = await seedProduct("tenant-1");
            const admin = adminToken();
            const mgr = managerToken("tenant-1");

            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({ label: "X" })
                .expect(409);

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${mgr}`])
                .send({ label: "X" })
                .expect(404);
        });
    });

    describe("Auth / validator", () => {
        it("401 unauth / invalid / expired", async () => {
            const p = await seedProduct("tenant-1");

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .send({ label: "X" })
                .expect(401);

            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({ label: "X" })
                .expect(401);

            const expired = jwks.token({ sub: "u1", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${expired}`])
                .send({ label: "X" })
                .expect(401);
        });

        it("403 non-admin/manager", async () => {
            const p = await seedProduct("tenant-1");
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .patch(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(403);
        });

        it("400 invalid ObjectId", async () => {
            const t = adminToken();
            await request(app)
                .patch(route("bad-id", "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(400);
        });
    });
});
