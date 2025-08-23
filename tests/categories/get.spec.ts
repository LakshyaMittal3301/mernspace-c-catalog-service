import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import mongoose from "mongoose";

describe("READ: GET /categories & GET /categories/:id", () => {
    const baseRoute = "/categories";

    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "u-1", role, ...extra });

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = () => makeToken(Roles.MANAGER);
    const customerToken = () => makeToken(Roles.CUSTOMER ?? "customer");

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

    /** Seed helpers */
    const seedActive = async (name = "Active-1") =>
        (await CategoryModel.create({ name, attributes: [], modificationPresets: [], isDeleted: false })).toObject();

    const seedDeleted = async (name = "Deleted-1") =>
        (
            await CategoryModel.create({
                name,
                attributes: [],
                modificationPresets: [],
                isDeleted: true,
                deletedAt: new Date(),
            })
        ).toObject();

    // =============== LIST ===============
    describe("GET /categories (list)", () => {
        describe("Admin behavior", () => {
            it("200 default includeDeleted=false → returns only active", async () => {
                const t = adminToken();
                await seedActive("A1");
                await seedDeleted("D1");

                const res = await request(app)
                    .get(baseRoute) // default false
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const list = res.body.categories ?? res.body;
                expect(Array.isArray(list)).toBe(true);
                const names = list.map((c: any) => c.name).sort();
                expect(names).toEqual(["A1"]);

                const cat = list[0];
                expect(cat).toMatchObject({ name: "A1", isDeleted: false });
                expect(cat.deletedAt).toBeUndefined();
                expect(Array.isArray(cat.attributes)).toBe(true);
                expect(Array.isArray(cat.modificationPresets)).toBe(true);
                expect(cat).toHaveProperty("id");
            });

            it("200 includeDeleted=true → returns active + deleted; deleted have deletedAt", async () => {
                const t = adminToken();
                await seedActive("A1");
                await seedDeleted("D1");

                const res = await request(app)
                    .get(`${baseRoute}?includeDeleted=true`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const list = res.body.categories ?? res.body;
                const names = list.map((c: any) => c.name).sort();
                expect(names).toEqual(["A1", "D1"]);

                const d = list.find((x: any) => x.name === "D1");
                expect(d.isDeleted).toBe(true);
                expect(new Date(d.deletedAt).getTime()).toBeGreaterThan(0);
            });

            it("200 returns empty array when DB empty", async () => {
                const t = adminToken();
                const res = await request(app)
                    .get(baseRoute)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);
                const list = res.body.categories ?? res.body;
                expect(list).toHaveLength(0);
            });

            it("400 when includeDeleted is not boolean-like", async () => {
                const t = adminToken();
                await seedActive("A1");

                const res = await request(app)
                    .get(`${baseRoute}?includeDeleted=notaboolean`)
                    .set("Cookie", [`accessToken=${t}`]);

                expect(res.statusCode).toBe(400);
            });

            it("200 when includeDeleted is a boolean-like string (true/false) → coerced", async () => {
                const t = adminToken();
                await seedActive("A1");
                await seedDeleted("D1");

                const res = await request(app)
                    .get(`${baseRoute}?includeDeleted=false`) // should behave as false
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const names = (res.body.categories ?? res.body).map((c: any) => c.name).sort();
                expect(names).toEqual(["A1"]);
            });
        });

        describe("Manager behavior", () => {
            it("200 always only active, even if includeDeleted=true is sent", async () => {
                const t = managerToken();
                await seedActive("A1");
                await seedDeleted("D1");

                const res = await request(app)
                    .get(`${baseRoute}?includeDeleted=true`) // ignored for manager
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const list = res.body.categories ?? res.body;
                const names = list.map((c: any) => c.name).sort();
                expect(names).toEqual(["A1"]);
                expect(list[0].isDeleted).toBe(false);
                expect(list[0].deletedAt).toBeUndefined();
            });

            it("400 when includeDeleted is invalid (validator still applies)", async () => {
                const t = managerToken();
                await seedActive("A1");

                const res = await request(app)
                    .get(`${baseRoute}?includeDeleted=abc`)
                    .set("Cookie", [`accessToken=${t}`]);

                expect(res.statusCode).toBe(400);
            });
        });

        describe("Auth / RBAC", () => {
            it("401 when unauthenticated", async () => {
                await request(app).get(baseRoute).expect(401);
            });

            it("401 when token clearly invalid", async () => {
                await request(app).get(baseRoute).set("Cookie", ["accessToken=not-a-jwt"]).expect(401);
            });

            it("401 when token expired", async () => {
                const expired = jwks.token({ sub: "123", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
                await request(app)
                    .get(baseRoute)
                    .set("Cookie", [`accessToken=${expired}`])
                    .expect(401);
            });

            it("403 when role is neither ADMIN nor MANAGER", async () => {
                await request(app)
                    .get(baseRoute)
                    .set("Cookie", [`accessToken=${customerToken()}`])
                    .expect(403);
            });
        });
    });

    // =============== BY ID ===============
    describe("GET /categories/:id (byId)", () => {
        describe("Admin behavior (default includeDeleted=false)", () => {
            it("200 default (false) → returns active category", async () => {
                const t = adminToken();
                const a1 = await seedActive("A1");

                const res = await request(app)
                    .get(`${baseRoute}/${a1._id}`) // default false
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const cat = res.body.category ?? res.body;
                expect(cat).toMatchObject({ name: "A1", isDeleted: false });
                expect(cat.deletedAt).toBeUndefined();
                expect(cat).toHaveProperty("id");
            });

            it("409 default (false) → when category is archived", async () => {
                const t = adminToken();
                const d1 = await seedDeleted("D1");

                const res = await request(app)
                    .get(`${baseRoute}/${d1._id}`) // default false
                    .set("Cookie", [`accessToken=${t}`]);

                expect(res.statusCode).toBe(409);
            });

            it("200 includeDeleted=true → returns archived category with deletedAt", async () => {
                const t = adminToken();
                const d1 = await seedDeleted("D1");

                const res = await request(app)
                    .get(`${baseRoute}/${d1._id}?includeDeleted=true`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const cat = res.body.category ?? res.body;
                expect(cat.isDeleted).toBe(true);
                expect(new Date(cat.deletedAt).getTime()).toBeGreaterThan(0);
            });

            it("400 when id is not a valid ObjectId", async () => {
                const t = adminToken();
                await request(app)
                    .get(`${baseRoute}/not-an-objectid`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(400);
            });

            it("404 when category not found", async () => {
                const t = adminToken();
                const missing = new mongoose.Types.ObjectId().toHexString();
                await request(app)
                    .get(`${baseRoute}/${missing}`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(404);
            });

            it("400 when includeDeleted is invalid", async () => {
                const t = adminToken();
                const a1 = await seedActive("A1");
                await request(app)
                    .get(`${baseRoute}/${a1._id}?includeDeleted=maybe`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(400);
            });

            it("200 when includeDeleted=false explicitly and category is active", async () => {
                const t = adminToken();
                const a1 = await seedActive("A1");
                await request(app)
                    .get(`${baseRoute}/${a1._id}?includeDeleted=false`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);
            });
        });

        describe("Manager behavior (forced includeDeleted=false)", () => {
            it("200 returns active category; includeDeleted=true is ignored", async () => {
                const t = managerToken();
                const a1 = await seedActive("A1");

                const res = await request(app)
                    .get(`${baseRoute}/${a1._id}?includeDeleted=true`) // ignored
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(200);

                const cat = res.body.category ?? res.body;
                expect(cat.name).toBe("A1");
                expect(cat.isDeleted).toBe(false);
                expect(cat.deletedAt).toBeUndefined();
            });

            it("404 when category is archived (do not leak archive state)", async () => {
                const t = managerToken();
                const d1 = await seedDeleted("D1");

                await request(app)
                    .get(`${baseRoute}/${d1._id}`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(404);
                await request(app)
                    .get(`${baseRoute}/${d1._id}?includeDeleted=true`) // still 404
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(404);
            });

            it("404 when category not found", async () => {
                const t = managerToken();
                const missing = new mongoose.Types.ObjectId().toHexString();
                await request(app)
                    .get(`${baseRoute}/${missing}`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(404);
            });

            it("400 when id is not a valid ObjectId", async () => {
                const t = managerToken();
                await request(app)
                    .get(`${baseRoute}/bad-id`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(400);
            });

            it("400 when includeDeleted is invalid", async () => {
                const t = managerToken();
                const a1 = await seedActive("A1");
                await request(app)
                    .get(`${baseRoute}/${a1._id}?includeDeleted=nope`)
                    .set("Cookie", [`accessToken=${t}`])
                    .expect(400);
            });
        });

        describe("Auth / RBAC", () => {
            it("401 when unauthenticated", async () => {
                const a1 = await seedActive("A1");
                await request(app).get(`${baseRoute}/${a1._id}`).expect(401);
            });

            it("401 when token clearly invalid", async () => {
                const a1 = await seedActive("A1");
                await request(app).get(`${baseRoute}/${a1._id}`).set("Cookie", ["accessToken=not-a-jwt"]).expect(401);
            });

            it("401 when token expired", async () => {
                const a1 = await seedActive("A1");
                const expired = jwks.token({ sub: "123", role: Roles.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
                await request(app)
                    .get(`${baseRoute}/${a1._id}`)
                    .set("Cookie", [`accessToken=${expired}`])
                    .expect(401);
            });

            it("403 when role is neither ADMIN nor MANAGER", async () => {
                const a1 = await seedActive("A1");
                await request(app)
                    .get(`${baseRoute}/${a1._id}`)
                    .set("Cookie", [`accessToken=${customerToken()}`])
                    .expect(403);
            });
        });
    });
});
