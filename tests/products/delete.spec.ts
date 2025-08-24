import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import { ProductModel } from "../../src/products/product.model";
import mongoose from "mongoose";

const oid = () => new mongoose.Types.ObjectId().toHexString();

async function createCategory(name = "Pizza-Cat") {
    const created = await CategoryModel.create({
        name,
        attributes: [
            {
                kind: "radio",
                name: "Size",
                options: [
                    { id: "sz-s", label: "S" },
                    { id: "sz-m", label: "M" },
                    { id: "sz-l", label: "L" },
                ],
                isRequired: true,
                defaultOptionId: "sz-m",
            },
            {
                kind: "switch",
                name: "Gluten Free",
                options: [
                    { id: "gf-no", label: "No" },
                    { id: "gf-yes", label: "Yes" },
                ],
                defaultOptionId: "gf-no",
            },
            {
                kind: "checkbox",
                name: "Toppings",
                options: [
                    { id: "tp-ol", label: "Olives" },
                    { id: "tp-mu", label: "Mushrooms" },
                    { id: "tp-pe", label: "Peppers" },
                ],
                minSelected: 0,
                maxSelected: 2,
            },
        ],
        modificationPresets: [],
    });
    return created;
}

async function createProduct(tenantId: string, categoryId: string, name = "Margherita") {
    const product = await ProductModel.create({
        tenantId,
        name,
        description: "Classic cheese pizza",
        categoryId,
        attributeValues: [],
        modifications: [
            {
                id: "base-1",
                name: "Base",
                kind: "radio",
                isBase: true,
                options: [{ id: "b-std", label: "Standard", price: 29900 }],
                defaultOptionId: "b-std",
            },
        ],
        status: "active",
    });
    return product;
}

describe("DELETE /products/:id", () => {
    const route = (id: string) => `/products/${id}`;
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u-1", role, ...extra });
    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId?: string) => makeToken(Roles.MANAGER, tenantId ? { tenantId } : {});

    beforeAll(async () => {
        await startTestMongo("catalog_product_delete");
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

    describe("Happy path & idempotency", () => {
        it("204 (ADMIN) soft-deletes product; sets isDeleted & deletedAt", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));

            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            const persisted = await ProductModel.findById(prod._id).lean();
            expect(persisted?.isDeleted).toBe(true);
            expect(persisted?.deletedAt).toBeTruthy();
        });

        it("204 again when already deleted (idempotent)", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));

            // first delete
            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            // second delete
            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);
        });

        it("allows creating a new product with same name in same tenant after delete", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-dup", String(cat._id), "SameName");

            // delete existing
            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            // create new with same (tenant, name) should succeed due to partial unique index
            const created = await ProductModel.create({
                tenantId: "t-dup",
                name: "SameName",
                description: "Recreated",
                categoryId: String(cat._id),
                attributeValues: [],
                modifications: [
                    {
                        id: "base-2",
                        name: "Base",
                        kind: "radio",
                        isBase: true,
                        options: [{ id: "b-std", label: "Standard", price: 100 }],
                        defaultOptionId: "b-std",
                    },
                ],
                status: "active",
            });
            expect(created).toBeTruthy();
        });
    });

    describe("RBAC", () => {
        it("204 (MANAGER) deletes within own tenant", async () => {
            const cat = await createCategory();
            const prod = await createProduct("tenant-mgr", String(cat._id));

            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken("tenant-mgr")}`])
                .expect(204);
        });

        it("403 when MANAGER tries to delete product from another tenant", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));

            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken("t-OTHER")}`])
                .expect(403);
        });

        it("403 when MANAGER token has no tenantId claim", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));

            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken()}`])
                .expect(403);
        });
    });

    describe("Auth errors", () => {
        it("401 when unauthenticated", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .delete(route(String(prod._id)))
                .expect(401);
        });

        it("401 when token invalid", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .expect(401);
        });

        it("401 when token expired", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            const expired = jwks.token({ sub: "u", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .delete(route(String(prod._id)))
                .set("Cookie", [`accessToken=${expired}`])
                .expect(401);
        });
    });

    describe("Invalid / not found ids", () => {
        it("400 when id is not a valid ObjectId", async () => {
            await request(app)
                .delete("/products/not-an-id")
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(400);
        });

        it("404 when product not found", async () => {
            const nonExistent = oid();
            await request(app)
                .delete(`/products/${nonExistent}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(404);
        });
    });
});
