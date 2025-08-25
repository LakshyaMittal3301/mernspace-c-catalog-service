import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("POST /products/:id/modifications/:modId/options (add options)", () => {
    const route = (id: string, modId: string) => `/products/${id}/modifications/${modId}/options`;
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    const seedProduct = async (tenantId = "t-001") => {
        const doc = await ProductModel.create({
            tenantId,
            name: "Pizzetta",
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
                    id: "mod-r2",
                    kind: "radio",
                    name: "Sauce",
                    options: [
                        { id: "opt-r2a", label: "Tomato", price: 0 },
                        { id: "opt-r2b", label: "Pesto", price: 500 },
                    ],
                    defaultOptionId: "opt-r2a",
                },
                {
                    id: "mod-c1",
                    kind: "checkbox",
                    name: "Extras",
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
        await startTestMongo("catalog_mod_opt_add");
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
        it("200 (ADMIN) adds options to checkbox group and persists ids", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            const res = await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    options: [
                        { label: "Peppers", price: 1800 },
                        { label: "Onions", price: 1200 },
                    ],
                })
                .expect(200);

            const product = res.body.product ?? res.body;
            const c1 = product.modifications.find((m: any) => m.id === "mod-c1");
            expect(c1.options.some((o: any) => o.label === "Peppers")).toBe(true);
            expect(c1.options.find((o: any) => o.label === "Peppers").id).toBeTruthy();

            // persisted
            const persisted = await ProductModel.findById(p._id).lean();
            const persistedC1 = (persisted!.modifications as any[]).find((m) => m.id === "mod-c1");
            expect(persistedC1.options.map((o: any) => o.label)).toEqual(
                expect.arrayContaining(["Peppers", "Onions", "Olives", "Mushrooms"]),
            );
        });

        it("200 (MANAGER) adds options in own tenant; 403 for other tenant", async () => {
            const myTenant = "t-mgr";
            const pMine = await seedProduct(myTenant);
            const t = managerToken(myTenant);

            await request(app)
                .post(route(String(pMine._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Arrabbiata", price: 700 }] })
                .expect(200);

            const other = await seedProduct("t-other");
            await request(app)
                .post(route(String(other._id), "mod-r2"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "BBQ", price: 800 }] })
                .expect(403);
        });
    });

    describe("Validation / invariants", () => {
        it("400 when body missing or options empty", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [] })
                .expect(400);
        });

        it("400 when price negative or id provided by client", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "Bad", price: -1 }] })
                .expect(400);

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ id: "hack", label: "X", price: 1000 }] })
                .expect(400);
        });

        it("404 when product not found; 404 when modification not found", async () => {
            const t = adminToken();
            await request(app)
                .post(route("64b9b1f4c7a3b2a1f1f1f1f1", "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X", price: 1000 }] })
                .expect(404);

            const p = await seedProduct("tenant-1");
            await request(app)
                .post(route(String(p._id), "does-not-exist"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X", price: 1000 }] })
                .expect(404);
        });

        it("409 (ADMIN) / 404 (MANAGER) when product archived; 400 when modification archived", async () => {
            const p = await seedProduct("tenant-1");
            const admin = adminToken();
            const mgr = managerToken("tenant-1");

            // archive product
            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({ options: [{ label: "X", price: 1000 }] })
                .expect(409);

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${mgr}`])
                .send({ options: [{ label: "X", price: 1000 }] })
                .expect(404);

            // unarchive, then archive the modification itself
            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: false }, $unset: { deletedAt: "" } });
            await ProductModel.updateOne(
                { _id: p._id, "modifications.id": "mod-c1" },
                { $set: { "modifications.$.isDeleted": true, "modifications.$.deletedAt": new Date() } },
            );

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({ options: [{ label: "Y", price: 1000 }] })
                .expect(400);
        });
    });

    describe("Auth / RBAC / validator", () => {
        it("401 unauthenticated / invalid / expired", async () => {
            const p = await seedProduct("tenant-1");
            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .send({ options: [{ label: "X", price: 1 }] })
                .expect(401);

            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({ options: [{ label: "X", price: 1 }] })
                .expect(401);

            const expired = jwks.token({ sub: "u1", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${expired}`])
                .send({ options: [{ label: "X", price: 1 }] })
                .expect(401);
        });

        it("403 when role is not ADMIN/MANAGER", async () => {
            const p = await seedProduct("tenant-1");
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .post(route(String(p._id), "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X", price: 1 }] })
                .expect(403);
        });

        it("400 when product id param is invalid", async () => {
            const t = adminToken();
            await request(app)
                .post(route("bad-id", "mod-c1"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ options: [{ label: "X", price: 1 }] })
                .expect(400);
        });
    });
});
