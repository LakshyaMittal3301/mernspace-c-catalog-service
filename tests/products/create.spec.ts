import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import { ProductModel } from "../../src/products/product.model";

describe("POST /products", () => {
    const route = "/products";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = (tenantId = "t-001") => makeToken(Roles.MANAGER, { tenantId });

    let category: any;
    let sizeAttr: any;
    let switchAttr: any;
    let checkboxAttr: any;

    beforeAll(async () => {
        await startTestMongo("catalog_products_test");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();

        // Seed a Category with attributes matching your model rules
        const created = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                {
                    kind: "radio",
                    name: "Size",
                    options: [{ label: "S" }, { label: "M" }, { label: "L" }],
                    defaultOptionIndex: 0,
                    isRequired: true,
                },
                {
                    kind: "switch",
                    name: "Gluten Free",
                    options: [{ label: "Yes" }, { label: "No" }],
                    defaultOptionIndex: 1,
                },
                {
                    kind: "checkbox",
                    name: "Toppings",
                    options: [{ label: "Olives" }, { label: "Mushrooms" }, { label: "Peppers" }],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
            modificationPresets: [],
        });

        category = await CategoryModel.findById(created._id).lean();
        sizeAttr = category.attributes.find((a: any) => a.name === "Size");
        switchAttr = category.attributes.find((a: any) => a.name === "Gluten Free");
        checkboxAttr = category.attributes.find((a: any) => a.name === "Toppings");
    });

    afterEach(() => {
        stopJwks();
    });

    afterAll(async () => {
        await stopTestMongo();
    });

    /**
     * Build a valid request body.
     * - tenantIdForAdmin: included in body when Admin is calling (required by controller)
     * - imageTenantId: used to construct image.key as "products/<imageTenantId>/...".
     *                  For Admin tests, pass the same as tenantIdForAdmin.
     *                  For Manager tests, pass the manager's token tenantId.
     */
    const validBody = (overrides: Partial<any> = {}, tenantIdForAdmin?: string, imageTenantId?: string) => {
        const imgTenant = imageTenantId ?? tenantIdForAdmin ?? "t-001";
        return {
            ...(tenantIdForAdmin ? { tenantId: tenantIdForAdmin } : {}),
            name: "Margherita",
            description: "Classic cheese pizza",
            image: { key: `products/${imgTenant}/u1/margherita.jpg`, url: "https://ignored.by.server" },
            categoryId: String(category._id),
            attributeValues: [
                // radio required -> must include a selection
                { defId: sizeAttr.id, kind: "radio", selectedOptionId: sizeAttr.defaultOptionId },
                { defId: switchAttr.id, kind: "switch", selectedOptionId: switchAttr.options[1].id },
                { defId: checkboxAttr.id, kind: "checkbox", selectedOptionIds: [checkboxAttr.options[0].id] },
            ],
            modifications: [
                {
                    name: "Base",
                    kind: "radio",
                    isBase: true,
                    options: [{ label: "Standard", price: 29900 }],
                    defaultOptionIndex: 0,
                },
                {
                    name: "Cheese",
                    kind: "checkbox",
                    options: [
                        { label: "Extra Cheese", price: 3000 },
                        { label: "Double Cheese", price: 5000 },
                    ],
                    minSelected: 0,
                    maxSelected: 1,
                },
            ],
            status: "active",
            ...overrides,
        };
    };

    describe("Happy path", () => {
        it("201 (ADMIN) creates product when tenantId provided; maps defaultOptionIndex → defaultOptionId", async () => {
            const t = adminToken();

            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({}, "tenant-1", "tenant-1"))
                .expect(201);

            expect(res.headers["content-type"]).toContain("json");
            const product = res.body.product ?? res.body;
            expect(product).toHaveProperty("id");
            expect(product).toHaveProperty("tenantId", "tenant-1");
            expect(product).toHaveProperty("name", "Margherita");
            expect(product).toHaveProperty("categoryId", String(category._id));
            expect(Array.isArray(product.modifications)).toBe(true);

            const base = product.modifications.find((m: any) => m.name === "Base");
            expect(base.kind).toBe("radio");
            expect(base.isBase).toBe(true);
            expect(base.defaultOptionId).toBeTruthy();
            expect(base.options.some((o: any) => o.id === base.defaultOptionId)).toBe(true);

            // ensure persisted with defaultOptionId (and index not persisted)
            const persisted = await ProductModel.findById(product.id).lean();
            expect(persisted).toBeTruthy();
            if (!persisted) throw new Error("Persisted product not found");

            const persistedBase = (persisted.modifications as any[]).find((m: any) => m.name === "Base");
            expect(persistedBase).toBeTruthy();
            if (!persistedBase) throw new Error("Base modification not found");

            expect(persistedBase.defaultOptionId).toBeTruthy();
            expect("defaultOptionIndex" in persistedBase).toBe(false);

            // image url recomputed server-side
            expect(product.image.key).toBe(`products/tenant-1/u1/margherita.jpg`);
            expect(typeof product.image.url).toBe("string");
            expect(product.image.url).toContain(product.image.key);
        });

        it("201 (MANAGER) ignores body.tenantId and uses tenantId from JWT", async () => {
            const t = managerToken("tenant-XYZ");
            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                // Build image key with manager's tenant
                .send(validBody({ tenantId: "wrong-tenant" }, undefined, "tenant-XYZ"))
                .expect(201);

            const product = res.body.product ?? res.body;
            expect(product.tenantId).toBe("tenant-XYZ");
            expect(product.image.key).toBe(`products/tenant-XYZ/u1/margherita.jpg`);
        });

        it("persists and can be queried back from DB", async () => {
            const t = adminToken();
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({}, "tenant-2", "tenant-2"))
                .expect(201);

            const docs = await ProductModel.find({ tenantId: "tenant-2" });
            expect(docs).toHaveLength(1);
            expect(docs[0].name).toBe("Margherita");
        });
    });

    describe("Validation / invariants", () => {
        it("400 when name missing", async () => {
            const t = adminToken();
            const body = validBody({ name: "" }, "tenant-1", "tenant-1");
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when description missing", async () => {
            const t = adminToken();
            const { description, ...rest } = validBody({}, "tenant-1", "tenant-1");
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(rest)
                .expect(400);
        });

        it("400 when categoryId missing", async () => {
            const t = adminToken();
            const { categoryId, ...rest } = validBody({}, "tenant-1", "tenant-1");
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(rest)
                .expect(400);
        });

        it("400 when modifications are missing or empty", async () => {
            const t = adminToken();
            const body = { ...validBody({}, "tenant-1", "tenant-1"), modifications: [] };
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when there is no base radio (isBase=true)", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            // flip isBase off
            body.modifications[0].isBase = false;
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when more than one base radio is present", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            body.modifications.unshift({
                name: "Alt Base",
                kind: "radio",
                isBase: true,
                options: [{ label: "Alt", price: 10000 }],
                defaultOptionIndex: 0,
            });
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when base radio has defaultOptionIndex out of range", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            body.modifications[0].defaultOptionIndex = 9; // out of range
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when checkbox is marked as isBase", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            (body.modifications[1] as any).isBase = true;
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when option price is negative", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            body.modifications[1].options[0].price = -1; // invalid
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when attributeValues refer to wrong defId", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            body.attributeValues[0].defId = "non-existent";
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when radio attribute is required but no selection provided", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            // remove selection for required radio Size
            (body.attributeValues[0] as any).selectedOptionId = undefined;
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when checkbox selections exceed maxSelected per category def", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "tenant-1");
            // category checkbox maxSelected = 2, push 3 options to violate
            (body.attributeValues[2] as any).selectedOptionIds = checkboxAttr.options.map((o: any) => o.id); // 3
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("400 when image key prefix does not match tenant", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-1", "WRONG-TENANT");
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("does not create product on validation error", async () => {
            const t = adminToken();
            const { name, ...bad } = validBody({}, "tenant-1", "tenant-1"); // missing name
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(bad)
                .expect(400);
            const docs = await ProductModel.find();
            expect(docs).toHaveLength(0);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            await request(app)
                .post(route)
                .send(validBody({}, "tenant-1", "tenant-1"))
                .expect(401);
        });

        it("401 when token invalid", async () => {
            await request(app)
                .post(route)
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send(validBody({}, "tenant-1", "tenant-1"))
                .expect(401);
        });

        it("401 when token expired", async () => {
            const expired = jwks.token({
                sub: "u1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${expired}`])
                .send(validBody({}, "tenant-1", "tenant-1"))
                .expect(401);
        });

        it("403 when role is not ADMIN/MANAGER", async () => {
            const t = makeToken("CUSTOMER" as any);
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({}, "tenant-1", "tenant-1"))
                .expect(403);
        });

        it("400 (ADMIN) when tenantId missing in body", async () => {
            const t = adminToken();
            const { tenantId, ...body } = validBody({}, "tenant-1", "tenant-1");
            // send without tenantId
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(400);
        });

        it("403 (MANAGER) when tenantId missing from JWT", async () => {
            const t = makeToken(Roles.MANAGER); // no tenantId claim
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({ tenantId: "tenant-ignored" }, undefined, "t-001"))
                .expect(403);
        });
    });

    describe("Duplicate name per tenant", () => {
        it("409 when same tenant & same name (active)", async () => {
            const t = adminToken();
            const body = validBody({}, "tenant-dup", "tenant-dup");
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(201);
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(409);
        });

        it("201 allowed when different tenants use same product name", async () => {
            const t = adminToken();
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({}, "tenant-A", "tenant-A"))
                .expect(201);
            await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(validBody({}, "tenant-B", "tenant-B"))
                .expect(201);
        });
    });
});
