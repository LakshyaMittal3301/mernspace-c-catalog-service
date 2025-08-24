import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import { ProductModel } from "../../src/products/product.model";

// ---- helpers ----
const makeTokenFactory =
    (jwks: JWKSMock) =>
    (role: string, extra: Record<string, any> = {}) =>
        jwks.token({ sub: "u-1", role, ...extra });

async function createCategory(name = "Pizza-Cat") {
    // Build a category with a required radio, a switch (2 options), and a checkbox with max 2
    const cat = await CategoryModel.create({
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
    return cat;
}

async function createProduct(tenantId: string, categoryId: string, name = "Margherita") {
    // Minimal valid product with exactly one base radio modification
    const product = await ProductModel.create({
        tenantId,
        name,
        description: "Classic cheese pizza",
        categoryId,
        image: undefined,
        attributeValues: [], // can be empty initially
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

describe("PATCH /products/:id", () => {
    const route = (id: string) => `/products/${id}`;
    let jwks: JWKSMock;
    let stopJwks: () => void;

    beforeAll(async () => {
        await startTestMongo("catalog_product_patch");
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

    const makeToken = () => makeTokenFactory(jwks);
    const adminToken = () => makeToken()(Roles.ADMIN);
    const managerToken = (tenantId?: string) => makeToken()(Roles.MANAGER, tenantId ? { tenantId } : {});

    describe("Happy path", () => {
        it("200 updates name/description/status and replaces image (url recomputed), ADMIN", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id), "Classic");

            const res = await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    name: "Classic Updated",
                    description: "New desc",
                    status: "archived",
                    image: { key: "products/t-1/u1/new.jpg", url: "IGNORED-BY-SERVER" },
                })
                .expect(200);

            const p = res.body.product;
            expect(p.name).toBe("Classic Updated");
            expect(p.status).toBe("archived");
            expect(p.image.key).toBe("products/t-1/u1/new.jpg");
            // url is recomputed server-side; at least ensure it contains the key
            expect(typeof p.image.url).toBe("string");
            expect(p.image.url).toContain(p.image.key);

            // persisted
            const persisted = await ProductModel.findById(prod._id).lean();
            expect(persisted?.name).toBe("Classic Updated");
            expect(persisted?.status).toBe("archived");
            expect(persisted?.image?.key).toBe("products/t-1/u1/new.jpg");
        });

        it("200 (MANAGER) updates within own tenant", async () => {
            const cat = await createCategory();
            const prod = await createProduct("tenant-mgr", String(cat._id));

            const res = await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken("tenant-mgr")}`])
                .send({ description: "Updated by manager" })
                .expect(200);

            expect(res.body.product.description).toBe("Updated by manager");
        });
    });

    describe("Category change & attributeValues semantics", () => {
        it("200 when categoryId changes: clears attributeValues even if provided", async () => {
            const cat1 = await createCategory("Cat-A");
            const cat2 = await createCategory("Cat-B");
            const prod = await createProduct("t-1", String(cat1._id));

            const res = await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    categoryId: String(cat2._id),
                    attributeValues: [
                        { defId: "sz-s", kind: "radio", selectedOptionId: "sz-s" }, // should be ignored due to category change
                    ],
                })
                .expect(200);

            expect(res.body.product.categoryId).toBe(String(cat2._id));
            expect(Array.isArray(res.body.product.attributeValues)).toBe(true);
            expect(res.body.product.attributeValues.length).toBe(0);

            const persisted = await ProductModel.findById(prod._id).lean();
            expect(persisted?.attributeValues?.length ?? 0).toBe(0);
        });

        it("200 replaces attributeValues set (valid against category defs)", async () => {
            const cat = await createCategory("Cat-Valid");
            const prod = await createProduct("t-1", String(cat._id));
            const catDoc = await CategoryModel.findById(cat._id).lean();

            const sizeDefId = catDoc!.attributes.find((a: any) => a.name === "Size")!.id;
            const gfDefId = catDoc!.attributes.find((a: any) => a.name === "Gluten Free")!.id;
            const topDefId = catDoc!.attributes.find((a: any) => a.name === "Toppings")!.id;

            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    attributeValues: [
                        { defId: gfDefId, kind: "switch", selectedOptionId: "gf-yes" },
                        { defId: sizeDefId, kind: "radio", selectedOptionId: "sz-m" },
                        { defId: topDefId, kind: "checkbox", selectedOptionIds: ["tp-ol", "tp-mu"] },
                    ],
                })
                .expect(200);

            // Persisted
            const persisted = await ProductModel.findById(prod._id).lean();
            expect(persisted?.attributeValues?.length).toBe(3);
        });

        it("400 when attributeValues violate defs (e.g., required radio missing selection / bad defId)", async () => {
            const cat = await createCategory("Cat-Invalids");
            const prod = await createProduct("t-1", String(cat._id));

            // wrong defId first
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    attributeValues: [{ defId: "not-on-category", kind: "radio", selectedOptionId: "x" }],
                })
                .expect(400);

            // required radio missing selection
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    attributeValues: [
                        { defId: "sz-m", kind: "radio" }, // Size is required → 400
                    ],
                })
                .expect(400);

            // checkbox selection exceeds max
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    attributeValues: [
                        { defId: "tp-ol", kind: "checkbox", selectedOptionIds: ["tp-ol", "tp-mu", "tp-pe"] }, // > max 2
                    ],
                })
                .expect(400);

            // ensure DB unchanged after failures
            const persisted = await ProductModel.findById(prod._id).lean();
            expect(persisted?.attributeValues?.length ?? 0).toBe(0);
        });
    });

    describe("Validation / invariants", () => {
        it("400 when body is empty", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({})
                .expect(400);
        });

        it("400 when forbidden field 'modifications' present", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    modifications: [
                        {
                            name: "Crust",
                            kind: "radio",
                            options: [{ label: "Thin", price: 0 }],
                            isBase: false,
                            defaultOptionIndex: 0,
                        },
                    ],
                })
                .expect(400);
        });

        it("400 when admin tries to send tenantId (immutable)", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ tenantId: "t-2" })
                .expect(400);
        });

        it("400 when image key prefix does not match product tenant", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ image: { key: "products/t-OTHER/u1/img.jpg" } })
                .expect(400);
        });
    });

    describe("RBAC", () => {
        it("401 when unauthenticated", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .send({ name: "X" })
                .expect(401);
        });

        it("401 when token invalid", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({ name: "X" })
                .expect(401);
        });

        it("401 when token expired", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            const expired = jwks.token({ sub: "u", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${expired}`])
                .send({ name: "X" })
                .expect(401);
        });

        it("403 when MANAGER tries to update product from another tenant", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken("t-OTHER")}`])
                .send({ name: "Nope" })
                .expect(403);
        });

        it("403 when MANAGER token has no tenantId claim", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken()}`])
                .send({ name: "X" })
                .expect(403);
        });
    });

    describe("Archived / deleted behavior", () => {
        it("409 (ADMIN) when product is soft-deleted; 404 (MANAGER)", async () => {
            const cat = await createCategory();
            const prod = await createProduct("t-1", String(cat._id));
            await ProductModel.updateOne({ _id: prod._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            // Admin sees archived → 409
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "NewName" })
                .expect(409);

            // Manager sees not found → 404
            await request(app)
                .patch(route(String(prod._id)))
                .set("Cookie", [`accessToken=${managerToken("t-1")}`])
                .send({ name: "NewName" })
                .expect(404);
        });
    });

    describe("Duplicate names", () => {
        it("409 when renaming to an existing active name in same tenant", async () => {
            const cat = await createCategory();
            const p1 = await createProduct("t-dup", String(cat._id), "Pizza-A");
            const p2 = await createProduct("t-dup", String(cat._id), "Pizza-B");

            await request(app)
                .patch(route(String(p1._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "Pizza-B" })
                .expect(409);
        });

        it("200 allowed to rename to a name used by a soft-deleted product", async () => {
            const cat = await createCategory();
            const pDeleted = await createProduct("t-dup2", String(cat._id), "OldName");
            await ProductModel.updateOne({ _id: pDeleted._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

            const pActive = await createProduct("t-dup2", String(cat._id), "OtherName");
            const res = await request(app)
                .patch(route(String(pActive._id)))
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({ name: "OldName" })
                .expect(200);

            expect(res.body.product.name).toBe("OldName");
        });
    });
});
