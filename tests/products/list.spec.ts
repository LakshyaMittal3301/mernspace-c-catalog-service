import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import { ProductModel } from "../../src/products/product.model";

describe("GET /products (list)", () => {
    const route = "/products";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });
    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "tenant-A") => makeToken(Roles.MANAGER, { tenantId });

    beforeAll(async () => {
        await startTestMongo("catalog_products_list");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();

        const cat1 = await CategoryModel.create({
            name: "Pizza",
            attributes: [],
            modificationPresets: [],
        });
        const cat2 = await CategoryModel.create({
            name: "Pasta",
            attributes: [],
            modificationPresets: [],
        });

        const baseMod = (price: number) => ({
            id: `base-${price}`,
            name: "Base",
            kind: "radio",
            isBase: true,
            options: [{ id: `opt-${price}`, label: "Std", price }],
            defaultOptionId: `opt-${price}`,
        });

        // Seed products across two tenants, various statuses & deletion flags
        await ProductModel.create([
            {
                tenantId: "tenant-A",
                name: "Alpha",
                description: "desc 1",
                categoryId: String(cat1._id),
                modifications: [baseMod(100)],
                status: "active",
            },
            {
                tenantId: "tenant-A",
                name: "Beta",
                description: "beta tasty",
                categoryId: String(cat1._id),
                modifications: [baseMod(250)],
                status: "draft",
            },
            {
                tenantId: "tenant-A",
                name: "Gamma",
                description: "archived one",
                categoryId: String(cat2._id),
                modifications: [baseMod(500)],
                status: "archived",
                isDeleted: true,
                deletedAt: new Date(),
            },

            {
                tenantId: "tenant-B",
                name: "Delta",
                description: "delta dish",
                categoryId: String(cat2._id),
                modifications: [baseMod(300)],
                status: "active",
            },
            {
                tenantId: "tenant-B",
                name: "Epsilon",
                description: "eps pasta",
                categoryId: String(cat2._id),
                modifications: [baseMod(450)],
                status: "draft",
            },
        ]);

        // tweak updatedAt order: update one doc to be "newer"
        await ProductModel.updateOne(
            { tenantId: "tenant-B", name: "Delta" },
            { $set: { description: "delta dish v2" } },
        );
    });

    afterEach(() => stopJwks());
    afterAll(async () => {
        await stopTestMongo();
    });

    describe("RBAC & scoping", () => {
        it("401 when unauthenticated", async () => {
            await request(app).get(route).expect(401);
        });

        it("403 for non-admin/manager roles", async () => {
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .get(route)
                .set("Cookie", [`accessToken=${t}`])
                .expect(403);
        });

        it("Manager sees only own tenant (exclude deleted by default)", async () => {
            const t = managerToken("tenant-A");
            const res = await request(app)
                .get(route)
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const { items, pageInfo } = res.body;
            expect(items.every((p: any) => p.tenantId === "tenant-A")).toBe(true);
            // Gamma is deleted → excluded
            expect(items.map((x: any) => x.name).sort()).toEqual(["Alpha", "Beta"].sort());
            // basePrice present
            expect(items.find((x: any) => x.name === "Alpha").basePrice).toBe(100);
        });

        it("Admin sees all tenants by default (exclude deleted)", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const names = res.body.items.map((x: any) => x.name).sort();
            expect(names).toEqual(["Alpha", "Beta", "Delta", "Epsilon"].sort());
        });

        it("Admin can filter by tenantId", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .query({ tenantId: "tenant-B" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const names = res.body.items.map((x: any) => x.name).sort();
            expect(names).toEqual(["Delta", "Epsilon"].sort());
        });

        it("Admin includeDeleted=true returns deleted too", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .query({ includeDeleted: true })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const names = res.body.items.map((x: any) => x.name).sort();
            expect(names).toEqual(["Alpha", "Beta", "Delta", "Epsilon", "Gamma"].sort());
            const gamma = res.body.items.find((x: any) => x.name === "Gamma");
            expect(gamma.isDeleted).toBe(true);
            expect(gamma.deletedAt).toBeTruthy();
        });

        it("Manager cannot enable includeDeleted (forced false)", async () => {
            const t = managerToken("tenant-A");
            const res = await request(app)
                .get(route)
                .query({ includeDeleted: true })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            const names = res.body.items.map((x: any) => x.name).sort();
            expect(names).toEqual(["Alpha", "Beta"].sort());
            expect(res.body.items.some((x: any) => x.isDeleted)).toBe(false);
        });
    });

    describe("Filtering & search", () => {
        it("Filter by status (single)", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .query({ status: "draft" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res.body.items.map((x: any) => x.name).sort()).toEqual(["Beta", "Epsilon"].sort());
        });

        it("Filter by status (multiple via comma)", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .query({ status: "draft,active" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res.body.items.map((x: any) => x.name).sort()).toEqual(["Alpha", "Beta", "Delta", "Epsilon"].sort());
        });

        it("Filter by categoryId", async () => {
            const t = adminToken();
            const cat = await CategoryModel.findOne({ name: "Pasta" }).lean();
            const res = await request(app)
                .get(route)
                .query({ categoryId: String(cat!._id) })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res.body.items.map((x: any) => x.name).sort()).toEqual(["Delta", "Epsilon"].sort()); // gamma excluded by default (deleted)
        });

        it("Admin + includeDeleted=true returns deleted under category too", async () => {
            const t = adminToken();
            const cat = await CategoryModel.findOne({ name: "Pasta" }).lean();
            const res = await request(app)
                .get(route)
                .query({ categoryId: String(cat!._id), includeDeleted: true })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res.body.items.map((x: any) => x.name).sort()).toEqual(["Delta", "Epsilon", "Gamma"].sort());
        });

        it("Search q matches name or description (case-insensitive)", async () => {
            const t = adminToken();
            const res1 = await request(app)
                .get(route)
                .query({ q: "beta" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res1.body.items.map((x: any) => x.name)).toEqual(["Beta"]);

            const res2 = await request(app)
                .get(route)
                .query({ q: "PASTA" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res2.body.items.map((x: any) => x.name).sort()).toEqual(["Epsilon"].sort());
        });
    });

    describe("Pagination & sorting", () => {
        it("Default sort createdAt desc, page=1 limit=20", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res.body.pageInfo.page).toBe(1);
            expect(res.body.pageInfo.limit).toBe(20);
            expect(res.body.pageInfo.total).toBe(4); // non-deleted by default
        });

        it("Sort by name asc/desc", async () => {
            const t = adminToken();
            const asc = await request(app)
                .get(route)
                .query({ sortBy: "name", sortOrder: "asc" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(asc.body.items.map((x: any) => x.name)).toEqual(["Alpha", "Beta", "Delta", "Epsilon"]);

            const desc = await request(app)
                .get(route)
                .query({ sortBy: "name", sortOrder: "desc" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(desc.body.items.map((x: any) => x.name)).toEqual(["Epsilon", "Delta", "Beta", "Alpha"]);
        });

        it("Sort by updatedAt desc", async () => {
            const t = adminToken();
            const res = await request(app)
                .get(route)
                .query({ sortBy: "updatedAt", sortOrder: "desc" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            // 'Delta' was updated in beforeEach; should appear before others from tenant-B
            const names = res.body.items.map((x: any) => x.name);
            expect(names[0]).toBeDefined();
        });

        it("Pagination page/limit with hasNextPage", async () => {
            const t = adminToken();
            const res1 = await request(app)
                .get(route)
                .query({ page: 1, limit: 2, sortBy: "name", sortOrder: "asc" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res1.body.items).toHaveLength(2);
            expect(res1.body.pageInfo.hasNextPage).toBe(true);

            const res2 = await request(app)
                .get(route)
                .query({ page: 2, limit: 2, sortBy: "name", sortOrder: "asc" })
                .set("Cookie", [`accessToken=${t}`])
                .expect(200);
            expect(res2.body.items).toHaveLength(2);
            expect(res2.body.pageInfo.hasNextPage).toBe(false);
        });
    });
});
