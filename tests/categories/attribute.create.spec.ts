import request from "supertest";
import mongoose from "mongoose";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("POST /categories/:id/attributes (Create Attribute)", () => {
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u-1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = () => makeToken(Roles.MANAGER);
    const customerToken = () => makeToken(Roles.CUSTOMER ?? "customer");

    const seedActiveCategory = async (name = "Pizza") => {
        const doc = await CategoryModel.create({
            name,
            attributes: [],
            modificationPresets: [],
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedDeletedCategory = async (name = "Archived") => {
        const doc = await CategoryModel.create({
            name,
            attributes: [],
            modificationPresets: [],
            isDeleted: true,
            deletedAt: new Date(),
        });
        return doc.toObject();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_test");
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

    describe("Happy path", () => {
        it("200 → creates a radio attribute; generates ids; maps defaultOptionIndex → defaultOptionId", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory("Pizza");
            const route = `/categories/${cat._id}/attributes`;

            const body = {
                name: "Size",
                kind: "radio",
                options: [{ label: "S" }, { label: "M" }, { label: "L" }],
                defaultOptionIndex: 1,
                isRequired: true,
            };

            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(201);

            const payload = res.body.category ?? res.body;
            expect(payload).toHaveProperty("id");
            expect(payload).toHaveProperty("name", "Pizza");

            const attr = (payload.attributes as any[]).find((a) => a.name === "Size");
            expect(attr).toBeTruthy();
            expect(attr).toHaveProperty("id"); // server-generated
            expect(attr.kind).toBe("radio");
            expect(attr.options).toHaveLength(3);
            expect(attr.options.every((o: any) => o.id && o.label)).toBe(true);

            expect(attr.defaultOptionId).toBeTruthy();
            const defaultOpt = attr.options.find((o: any) => o.id === attr.defaultOptionId);
            expect(defaultOpt?.label).toBe("M");

            // DB persisted check
            const fresh = await CategoryModel.findById(cat._id).lean();
            const dbAttr: any = fresh!.attributes.find((a: any) => a.name === "Size");
            expect(dbAttr).toBeTruthy();
            expect(dbAttr.defaultOptionId).toBe(attr.defaultOptionId);
        });

        it("200 → creates a switch attribute with exactly 2 options and defaultOptionIndex 0|1", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory("Pasta");
            const route = `/categories/${cat._id}/attributes`;

            const body = {
                name: "Gluten Free",
                kind: "switch",
                options: [{ label: "Yes" }, { label: "No" }],
                defaultOptionIndex: 0,
            };

            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(201);

            const attr = (res.body.category.attributes as any[]).find((a) => a.name === "Gluten Free");
            expect(attr.kind).toBe("switch");
            expect(attr.options).toHaveLength(2);
            expect(attr.defaultOptionId).toBeTruthy();
            const def = attr.options.find((o: any) => o.id === attr.defaultOptionId);
            expect(def?.label).toBe("Yes");
        });

        it("200 → creates a checkbox attribute honoring min/max within options length", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory("Burgers");
            const route = `/categories/${cat._id}/attributes`;

            const body = {
                name: "Toppings",
                kind: "checkbox",
                options: [{ label: "Cheese" }, { label: "Lettuce" }, { label: "Tomato" }],
                minSelected: 0,
                maxSelected: 2,
            };

            const res = await request(app)
                .post(route)
                .set("Cookie", [`accessToken=${t}`])
                .send(body)
                .expect(201);

            const attr = (res.body.category.attributes as any[]).find((a) => a.name === "Toppings");
            expect(attr.kind).toBe("checkbox");
            expect(attr.options).toHaveLength(3);
            // checkbox has no defaultOptionId
            expect(attr.defaultOptionId).toBeUndefined();
        });
    });

    describe("Validation errors", () => {
        it("400 → missing name", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory("Pizza");
            const res = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ kind: "radio", options: [{ label: "A" }] });
            expect(res.statusCode).toBe(400);
        });

        it("400 → invalid kind", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();
            const res = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Weird", kind: "toggle", options: [{ label: "X" }, { label: "Y" }] });
            expect(res.statusCode).toBe(400);
        });

        it("400 → options must be non-empty and labels non-empty", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();
            const res = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Empty", kind: "radio", options: [] });
            expect(res.statusCode).toBe(400);

            const res2 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "BadLabel", kind: "radio", options: [{ label: "" }] });
            expect(res2.statusCode).toBe(400);
        });

        it("400 → switch must have exactly 2 options and defaultOptionIndex 0|1", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();

            // Only 1 option
            const r1 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "GF", kind: "switch", options: [{ label: "Yes" }], defaultOptionIndex: 0 });
            expect(r1.statusCode).toBe(400);

            // defaultOptionIndex missing
            const r2 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "GF", kind: "switch", options: [{ label: "Yes" }, { label: "No" }] });
            expect(r2.statusCode).toBe(400);

            // defaultOptionIndex out of {0,1}
            const r3 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "GF",
                    kind: "switch",
                    options: [{ label: "Yes" }, { label: "No" }],
                    defaultOptionIndex: 3,
                });
            expect(r3.statusCode).toBe(400);
        });

        it("400 → radio defaultOptionIndex out of range", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();
            const res = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Size",
                    kind: "radio",
                    options: [{ label: "S" }, { label: "M" }],
                    defaultOptionIndex: 9, // invalid
                });
            expect(res.statusCode).toBe(400);
        });

        it("400 → checkbox: invalid min/max relationships", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();

            // min > max
            const r1 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }],
                    minSelected: 2,
                    maxSelected: 1,
                });
            expect(r1.statusCode).toBe(400);

            // max > options.length
            const r2 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }],
                    minSelected: 0,
                    maxSelected: 3,
                });
            expect(r2.statusCode).toBe(400);

            // defaultOptionIndex not allowed on checkbox
            const r3 = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }],
                    defaultOptionIndex: 0,
                });
            expect(r3.statusCode).toBe(400);
        });

        it("400 → forbid client-sent immutable/system fields (attribute.id, isDeleted, deletedAt, options.*.id)", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({
                    id: "client-sent",
                    name: "Bad",
                    kind: "radio",
                    isDeleted: false,
                    deletedAt: null,
                    options: [{ id: "client-sent", label: "X" }, { label: "Y" }],
                    defaultOptionIndex: 0,
                });
            expect(res.statusCode).toBe(400);
        });

        it("400 → invalid category id format (param)", async () => {
            const t = adminToken();
            const res = await request(app)
                .post(`/categories/not-a-valid-objectid/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }] });
            expect(res.statusCode).toBe(400);
        });
    });

    describe("Error cases (service/domain)", () => {
        it("404 → category not found", async () => {
            const t = adminToken();
            const missing = new mongoose.Types.ObjectId().toHexString();

            const res = await request(app)
                .post(`/categories/${missing}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }, { label: "M" }] });

            expect(res.statusCode).toBe(404);
        });

        it("409 → category archived", async () => {
            const t = adminToken();
            const archived = await seedDeletedCategory("Old");
            const res = await request(app)
                .post(`/categories/${archived._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }, { label: "M" }] });

            expect(res.statusCode).toBe(409);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 → unauthenticated", async () => {
            const cat = await seedActiveCategory();
            await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }] })
                .expect(401);
        });

        it("401 → token clearly invalid", async () => {
            const cat = await seedActiveCategory();
            await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", ["accessToken=not-a-jwt"])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }] })
                .expect(401);
        });

        it("401 → token expired", async () => {
            const cat = await seedActiveCategory();
            const expired = jwks.token({
                sub: "u-1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });
            await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${expired}`])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }] })
                .expect(401);
        });

        it("403 → role is neither ADMIN nor MANAGER", async () => {
            const t = customerToken();
            const cat = await seedActiveCategory();
            await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "Size", kind: "radio", options: [{ label: "S" }] })
                .expect(403);
        });
    });

    describe("Invariants", () => {
        it("does not alter DB on validation error", async () => {
            const t = adminToken();
            const cat = await seedActiveCategory();
            await request(app)
                .post(`/categories/${cat._id}/attributes`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ name: "", kind: "radio", options: [] })
                .expect(400);

            const fresh = await CategoryModel.findById(cat._id).lean();
            expect(fresh!.attributes).toHaveLength(0);
        });
    });
});
