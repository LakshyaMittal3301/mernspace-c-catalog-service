// tests/categories/delete.spec.ts
import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";

describe("DELETE /categories/:id (soft delete, idempotent)", () => {
    const baseRoute = "/categories";
    let jwks: JWKSMock;
    let stopJwks: () => void;

    const makeToken = (role: string, extra: Record<string, any> = {}) => jwks.token({ sub: "user-1", role, ...extra });

    beforeAll(async () => {
        await startTestMongo("catalog_delete_tests");
        jwks = createJWKSMock("http://localhost:5501");
    });

    beforeEach(async () => {
        stopJwks = jwks.start();
        await clearTestMongo();
    });

    afterEach(() => stopJwks());
    afterAll(async () => stopTestMongo());

    const adminToken = () => makeToken(Roles.ADMIN);
    const managerToken = () => makeToken(Roles.MANAGER);

    const createCategory = async (name = "Pizza") => {
        const res = await request(app)
            .post(baseRoute)
            .set("Cookie", [`accessToken=${adminToken()}`])
            .send({
                name,
                attributes: [
                    { kind: "radio", name: "Size", options: [{ label: "S" }, { label: "M" }], defaultOptionIndex: 0 },
                ],
                modificationPresets: [],
            })
            .expect(201);

        return res.body.category ?? res.body;
    };

    describe("Happy path / idempotency", () => {
        it("204 and sets isDeleted/deletedAt", async () => {
            const created = await createCategory("Drinks");

            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            const doc = await CategoryModel.findById(created.id).lean();
            expect(doc?.isDeleted).toBe(true);
            expect(doc?.deletedAt).toBeTruthy();
        });

        it("204 again when already soft-deleted (idempotent)", async () => {
            const created = await createCategory("Soups");

            // First delete
            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            // Second delete → still 204
            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            const doc = await CategoryModel.findById(created.id).lean();
            expect(doc?.isDeleted).toBe(true);
        });

        it("after soft delete, can create a new category with the same name (partial unique index)", async () => {
            const created = await createCategory("ArchivedName");

            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            // Reuse same name
            await request(app)
                .post(baseRoute)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .send({
                    name: "ArchivedName",
                    attributes: [],
                    modificationPresets: [],
                })
                .expect(201);
        });
    });

    describe("Validation / not found", () => {
        it("400 when id is not a valid ObjectId", async () => {
            await request(app)
                .delete(`${baseRoute}/not-a-valid-id`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(400);
        });

        it("404 when id is valid but category does not exist", async () => {
            await request(app)
                .delete(`${baseRoute}/64d23b9e3d5e4e0012345678`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(404);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 when unauthenticated", async () => {
            const created = await createCategory("NoAuth");
            await request(app).delete(`${baseRoute}/${created.id}`).expect(401);
        });

        it("401 when token is clearly invalid", async () => {
            const created = await createCategory("InvalidToken");
            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", ["accessToken=not-a-jwt"])
                .expect(401);
        });

        it("401 when token is expired", async () => {
            const created = await createCategory("ExpiredToken");
            const expired = jwks.token({
                sub: "user-1",
                role: Roles.ADMIN,
                exp: Math.floor(Date.now() / 1000) - 10,
            });

            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${expired}`])
                .expect(401);
        });

        it("403 when role is not ADMIN", async () => {
            const created = await createCategory("ManagerBlocked");
            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${managerToken()}`])
                .expect(403);
        });
    });

    describe("Invariants", () => {
        it("does not hard-delete the document (remains in DB with isDeleted=true)", async () => {
            const created = await createCategory("Invariant");
            await request(app)
                .delete(`${baseRoute}/${created.id}`)
                .set("Cookie", [`accessToken=${adminToken()}`])
                .expect(204);

            // Still present in DB, but marked deleted
            const exists = await CategoryModel.exists({ _id: created.id });
            expect(exists).toBeTruthy();

            const doc = await CategoryModel.findById(created.id).lean();
            expect(doc?.isDeleted).toBe(true);
            expect(doc?.deletedAt).toBeTruthy();
        });
    });
});
