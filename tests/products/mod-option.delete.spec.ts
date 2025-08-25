import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { ProductModel } from "../../src/products/product.model";

describe("DELETE /products/:id/modifications/:modId/options/:optId (soft delete option)", () => {
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
            name: "Quattro",
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
                    maxSelected: 1,
                },
            ],
        });
        return doc;
    };

    beforeAll(async () => {
        await startTestMongo("catalog_mod_opt_delete");
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

    describe("Happy / idempotent", () => {
        it("204 soft deletes a non-default option; repeated call is idempotent", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            // no body for DELETE
            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(204);

            const persisted = await ProductModel.findById(p._id).lean();
            const c1 = (persisted!.modifications as any[]).find((m) => m.id === "mod-c1");
            const c1a = c1.options.find((o: any) => o.id === "opt-c1a");
            expect(c1a.isDeleted).toBe(true);
            expect(c1a.deletedAt).toBeTruthy();
        });
    });

    describe("Conflicts", () => {
        it("409 cannot delete current default option from radio", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .delete(route(String(p._id), "mod-base", "opt-base-a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });

        it("409 cannot delete when it would become zero active options", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            // Soft delete one option first using native driver
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

            // Now try deleting last active option
            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1b"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });
    });

    describe("Not found / archived", () => {
        it("404 when product/mod/option not found; 400 when modification archived", async () => {
            const p = await seedProduct("tenant-1");
            const t = adminToken();

            await request(app)
                .delete(route("64b9b1f4c7a3b2a1f1f1f1f1", "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);

            await request(app)
                .delete(route(String(p._id), "nope", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);

            await request(app)
                .delete(route(String(p._id), "mod-c1", "nope"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);

            // Archive modification with native driver
            await ProductModel.collection.updateOne(
                { _id: p._id, "modifications.id": "mod-c1" },
                { $set: { "modifications.$[m].isDeleted": true, "modifications.$[m].deletedAt": new Date() } },
                { arrayFilters: [{ "m.id": "mod-c1" }] },
            );

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);
        });

        it("409 (ADMIN) / 404 (MANAGER) when product archived; 403 tenant mismatch for manager", async () => {
            const p = await seedProduct("tenant-1");
            const admin = adminToken();
            const mgr = managerToken("tenant-1");
            const mgrOther = managerToken("t-other");

            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${admin}`])
                .expect(409);

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${mgr}`])
                .expect(404);

            // Unarchive and try tenant mismatch
            await ProductModel.updateOne({ _id: p._id }, { $set: { isDeleted: false }, $unset: { deletedAt: "" } });

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${mgrOther}`])
                .expect(403);
        });
    });

    describe("Auth / validator", () => {
        it("401 unauth / invalid / expired", async () => {
            const p = await seedProduct("tenant-1");

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .expect(401);

            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .expect(401);

            const expired = jwks.token({ sub: "u1", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${expired}`])
                .expect(401);
        });

        it("403 non-admin/manager", async () => {
            const p = await seedProduct("tenant-1");
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });

        it("400 invalid ObjectId; 400 when body not empty", async () => {
            const t = adminToken();

            await request(app)
                .delete(route("bad-id", "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);

            const p = await seedProduct("tenant-1");
            await request(app)
                .delete(route(String(p._id), "mod-c1", "opt-c1a"))
                .set("Cookie", [`accessToken=${t}`])
                .send({ extra: true })
                .expect(400);
        });
    });
});
