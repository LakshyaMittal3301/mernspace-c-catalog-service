import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("POST /products/:id/modifications/:modId/options/:optId/default (set default for radio)", () => {
    const route = (id: string, modId: string, optId: string) =>
        `/products/${id}/modifications/${modId}/options/${optId}/default`;

    let jwks: JWKSMock;
    let stopJwks: () => void;
    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });
    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    const seedProduct = async (tenantId = "t-001") => {
        const doc = await ProductModel.create({
            tenantId,
            name: "Diavola",
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
                        { id: "opt-base-a", label: "S", price: 10000 },
                        { id: "opt-base-b", label: "M", price: 15000 },
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
        await startTestMongo("catalog_mod_opt_default");
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

    describe("Happy path / idempotent", () => {
        it("200 (ADMIN) sets default on radio; idempotent when same option", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(200);

            let persisted = await ProductModel.findById(p._id).lean();
            const r2 = (persisted!.modifications as any[]).find((m) => m.id === "mod-r2");
            expect(r2.defaultOptionId).toBe("opt-r2b");

            // call again → still 200
            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(200);
        });

        it("200 (MANAGER) allowed in own tenant; 403 for other tenant", async () => {
            const myTenant = "t-mgr";
            const mine = await seedProduct(myTenant);
            const other = await seedProduct("t-other");
            const mgr = managerToken(myTenant);

            await request(app)
                .post(route(String(mine._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${mgr}`])
                .send({})
                .expect(200);

            await request(app)
                .post(route(String(other._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${mgr}`])
                .send({})
                .expect(403);
        });
    });

    describe("Validation / domain errors", () => {
        it("400 when modification is checkbox; 404 when option not found", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .post(route(String(p._id), "mod-r2", "does-not-exist"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(404);
        });

        it("400 when target option is soft-deleted", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            // Use native driver to bypass Mongoose schema casting on discriminator paths
            await ProductModel.collection.updateOne(
                { _id: p._id, "modifications.id": "mod-r2" },
                {
                    $set: {
                        "modifications.$[m].options.$[o].isDeleted": true,
                        "modifications.$[m].options.$[o].deletedAt": new Date(),
                    },
                },
                { arrayFilters: [{ "m.id": "mod-r2" }, { "o.id": "opt-r2b" }] },
            );

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);
        });

        it("400 when target radio has no active options", async () => {
            const p = await seedProduct("tenant-1");

            // Soft-delete all options & unset defaultOptionId using native driver
            await ProductModel.collection.updateOne(
                { _id: p._id },
                {
                    $set: {
                        "modifications.$[m].options.$[].isDeleted": true,
                        "modifications.$[m].options.$[].deletedAt": new Date(),
                    },
                    $unset: { "modifications.$[m].defaultOptionId": "" },
                },
                { arrayFilters: [{ "m.id": "mod-r2" }] },
            );

            const after = await ProductModel.findById(p._id).lean();
            const r2 = (after!.modifications as any[]).find((m: any) => m.id === "mod-r2");
            const active = (r2.options ?? []).filter((o: any) => !o.isDeleted);
            expect(active).toHaveLength(0);
            expect(r2.defaultOptionId).toBeUndefined();

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2a"))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(400);
        });

        it("404 when product/mod not found", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .post(route("64b9b1f4c7a3b2a1f1f1f1f1", "mod-r2", "opt-r2a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(404);

            await request(app)
                .post(route(String(p._id), "nope", "opt-r2a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(404);
        });
    });

    describe("Auth / RBAC / validator", () => {
        it("409 (ADMIN) / 404 (MANAGER) when product archived", async () => {
            const p = await seedProduct("tenant-1");
            const admin = adminToken();
            const mgr = managerToken("tenant-1");

            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({})
                .expect(409);

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${mgr}`])
                .send({})
                .expect(404);
        });

        it("401 unauth / invalid / expired; 403 non-admin/manager; 400 invalid ObjectId; 400 body not empty", async () => {
            const p = await seedProduct("tenant-1");

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .send({})
                .expect(401);

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({})
                .expect(401);

            const expired = jwks.token({ sub: "u1", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${expired}`])
                .send({})
                .expect(401);

            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(403);

            const admin = adminToken();
            await request(app)
                .post(route("bad-id", "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({})
                .expect(400);

            await request(app)
                .post(route(String(p._id), "mod-r2", "opt-r2b"))
                .set("Cookie", [`accessToken=${admin}`])
                .send({ extra: true })
                .expect(400);
        });
    });
});
