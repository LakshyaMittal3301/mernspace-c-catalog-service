import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import { ProductModel } from "../../src/products/product.model";
import mongoose from "mongoose";

describe("GET /products/:id", () => {
    const route = (id: string, qs: Record<string, any> = {}) => {
        const url = new URL(`http://x/products/${id}`);
        Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        return url.pathname + url.search;
    };

    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "tenant-A") => makeToken(Roles.MANAGER, { tenantId });

    let cat: any;
    let prodTenantAActive: any;
    let prodTenantADeleted: any;
    let prodTenantBActive: any;

    beforeAll(async () => {
        await startTestMongo("catalog_products_get");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();

        // Seed a minimal category (no attributes needed for this test suite)
        cat = await CategoryModel.create({
            name: "Category-X",
            attributes: [],
            modificationPresets: [],
        });

        const base = (price: number) => ({
            name: "Base",
            kind: "radio",
            isBase: true,
            options: [
                { id: `base-ok-${price}`, label: "Std", price },
                { id: `base-deleted-${price}`, label: "Old", price: price + 100, isDeleted: true },
            ],
            defaultOptionId: `base-ok-${price}`,
        });

        // An extra checkbox group with one deleted option (to test filtering)
        const cheese = {
            name: "Cheese",
            kind: "checkbox",
            options: [
                { id: "c1", label: "Extra Cheese", price: 1000 },
                { id: "c2", label: "Old Cheese", price: 1500, isDeleted: true },
            ],
            minSelected: 0,
            maxSelected: 1,
        };

        // A deleted radio group (to test filtering of whole group)
        const saucesDeleted = {
            name: "Sauces",
            kind: "radio",
            isDeleted: true,
            options: [{ id: "s1", label: "Tomato", price: 0 }],
            defaultOptionId: "s1",
        };

        // Tenant A: active product
        prodTenantAActive = await ProductModel.create({
            tenantId: "tenant-A",
            name: "A-Active",
            description: "A active",
            image: { key: "products/tenant-A/abc/photo.jpg", url: "https://cdn.example.com/photo.jpg" },
            categoryId: String(cat._id),
            modifications: [base(10000), cheese, saucesDeleted],
            status: "active",
        });

        // Tenant A: deleted product
        prodTenantADeleted = await ProductModel.create({
            tenantId: "tenant-A",
            name: "A-Deleted",
            description: "A deleted",
            image: { key: "products/tenant-A/def/photo2.jpg", url: "https://cdn.example.com/photo2.jpg" },
            categoryId: String(cat._id),
            modifications: [base(20000), cheese, saucesDeleted],
            status: "archived",
            isDeleted: true,
            deletedAt: new Date(),
        });

        // Tenant B: active product
        prodTenantBActive = await ProductModel.create({
            tenantId: "tenant-B",
            name: "B-Active",
            description: "B active",
            image: { key: "products/tenant-B/ghi/photo.jpg", url: "https://cdn.example.com/b.jpg" },
            categoryId: String(cat._id),
            modifications: [base(30000), cheese, saucesDeleted],
            status: "active",
        });
    });

    afterEach(() => stopJwks());
    afterAll(async () => {
        await stopTestMongo();
    });

    describe("RBAC / auth", () => {
        it("401 when unauthenticated", async () => {
            await request(app)
                .get(route(String(prodTenantAActive._id)))
                .expect(401);
        });

        it("401 when token invalid", async () => {
            await request(app)
                .get(route(String(prodTenantAActive._id)))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .expect(401);
        });

        it("401 when token expired", async () => {
            const expired = jwks.token({
                sub: "u1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });
            await request(app)
                .get(route(String(prodTenantAActive._id)))
                .set("Cookie", [`accessToken=${expired}`])
                .expect(401);
        });

        it("403 for non-admin/manager roles", async () => {
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .get(route(String(prodTenantAActive._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });
    });

    describe("Validation", () => {
        it("400 on invalid id", async () => {
            const t = adminToken();
            await request(app)
                .get(route("not-a-valid-objectid"))
                .set("Cookie", [`accessToken=${t}`])
                .expect(400);
        });

        it("404 on non-existent id", async () => {
            const t = adminToken();
            const nonExistent = new mongoose.Types.ObjectId().toString();
            await request(app)
                .get(route(nonExistent))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });
    });

    describe("Access / scoping", () => {
        it("Admin can fetch any tenant's product (non-deleted)", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route(String(prodTenantBActive._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const p = res.body.product;
            expect(p.id).toBe(String(prodTenantBActive._id));
            expect(p.tenantId).toBe("tenant-B");
            // createdAt/updatedAt present
            expect(p.createdAt).toBeTruthy();
            expect(p.updatedAt).toBeTruthy();
        });

        it("Manager can fetch only own-tenant product; other tenant returns 404", async () => {
            const t = managerToken("tenant-A");
            // own tenant → OK
            await request(app)
                .get(route(String(prodTenantAActive._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            // other tenant → 404
            await request(app)
                .get(route(String(prodTenantBActive._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });
    });

    describe("includeDeleted & sub-item filtering", () => {
        it("Default includeDeleted=false: admin gets 409 for deleted product", async () => {
            const t = adminToken();
            await request(app)
                .get(route(String(prodTenantADeleted._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(409);
        });

        it("Default includeDeleted=false: manager gets 404 for deleted product", async () => {
            const t = managerToken("tenant-A");
            await request(app)
                .get(route(String(prodTenantADeleted._id)))
                .set("Cookie", [`accessToken=${t}`])
                .expect(404);
        });

        it("Admin includeDeleted=true can fetch deleted product, with deleted sub-items included", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route(String(prodTenantADeleted._id), { includeDeleted: true }))
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);

            const p = res.body.product;
            expect(p.isDeleted).toBe(true);
            expect(p.deletedAt).toBeTruthy();

            // sub-items are NOT filtered in includeDeleted=true
            const mods = p.modifications;
            const sauces = mods.find((m: any) => m.name === "Sauces");
            expect(sauces).toBeTruthy(); // whole deleted group present
            const cheese = mods.find((m: any) => m.name === "Cheese");
            expect(cheese.options.some((o: any) => o.id === "c2" && o.isDeleted === true)).toBe(true); // deleted option present
            const base = mods.find((m: any) => m.name === "Base");
            expect(
                base.options.some((o: any) => String(o.id).startsWith("base-deleted-") && o.isDeleted === true),
            ).toBe(true);
        });

        it("includeDeleted=false filters deleted sub-items from the payload", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route(String(prodTenantAActive._id), { includeDeleted: false }))
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);

            const p = res.body.product;
            expect(p.isDeleted).toBe(false);
            const mods = p.modifications;

            // Deleted group "Sauces" should be filtered out
            expect(mods.some((m: any) => m.name === "Sauces")).toBe(false);

            // In "Cheese", deleted option c2 should be removed
            const cheese = mods.find((m: any) => m.name === "Cheese");
            expect(cheese).toBeTruthy();
            expect(cheese.options.some((o: any) => o.id === "c2")).toBe(false);

            // In "Base", deleted option should be removed but group remains
            const base = mods.find((m: any) => m.name === "Base");
            expect(base).toBeTruthy();
            expect(base.options.some((o: any) => String(o.id).startsWith("base-deleted-"))).toBe(false);
        });

        it("Manager cannot enable includeDeleted=true (forced false) even for own tenant", async () => {
            const t = managerToken("tenant-A");
            // try includeDeleted=true → should behave like false (and return 200 for active product)
            const res = await request(app)
                .get(route(String(prodTenantAActive._id), { includeDeleted: true }))
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);

            const mods = res.body.product.modifications;
            // verify deleted sub-items are filtered (proving includeDeleted was forced to false)
            expect(mods.some((m: any) => m.name === "Sauces")).toBe(false);
            const cheese = mods.find((m: any) => m.name === "Cheese");
            expect(cheese.options.some((o: any) => o.id === "c2")).toBe(false);
        });
    });
});
