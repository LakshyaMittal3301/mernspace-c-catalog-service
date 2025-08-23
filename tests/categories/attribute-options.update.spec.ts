import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { CategoryModel } from "../../src/categories/category.model";
import { Roles } from "../../src/common/constants";

describe("PATCH /categories/:id/attributes/:attrId/options/:optId (rename option)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });
    const customer = () => jwks.token({ sub: "u3", role: Roles.CUSTOMER ?? "customer" });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                { name: "Size", kind: "radio", options: [{ label: "S" }, { label: "M" }], defaultOptionIndex: 1 },
            ],
            isDeleted: false,
        });
        return doc.toObject();
    };

    beforeAll(async () => {
        await startTestMongo("catalog_test");
        jwks = createJWKSMock("http://localhost:5501");
    });
    beforeEach(async () => {
        stop = jwks.start();
        await clearTestMongo();
    });
    afterEach(() => stop());
    afterAll(async () => {
        await stopTestMongo();
    });

    describe("Happy path", () => {
        it("200 → renames option label; defaultOptionId unchanged", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[1]; // default is "M"

            const res = await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "Medium" })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            const updatedOpt = updated.options.find((o: any) => o.id === opt.id);
            expect(updatedOpt.label).toBe("Medium");
            expect(updated.defaultOptionId).toBe(opt.id);
        });
    });

    describe("Validation / errors", () => {
        it("400 → body must contain only label and not be empty", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[0];

            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({})
                .expect(400);

            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "" })
                .expect(400);

            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "OK", id: "hack" })
                .expect(400);
        });

        it("404 → option not found (or deleted)", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];

            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/not-here`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "New" })
                .expect(404);
        });

        it("404 → attribute not found", async () => {
            const t = admin();
            const cat = await seedRadio();

            await request(app)
                .patch(`/categories/${cat._id}/attributes/not-there/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);
        });

        it("404 → category not found", async () => {
            const t = admin();

            await request(app)
                .patch(`/categories/66aabbccddeeff0011223344/attributes/attr/options/opt`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(404);
        });

        it("409 → category archived", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Archived",
                attributes: [
                    { name: "A", kind: "radio", options: [{ label: "X" }, { label: "Y" }], defaultOptionIndex: 0 },
                ],
                isDeleted: true,
                deletedAt: new Date(),
            });
            const attr = (doc.toObject() as any).attributes[0];
            const opt = attr.options[0];
            await request(app)
                .patch(`/categories/${doc._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "Renamed" })
                .expect(409);
        });
    });

    describe("Auth / RBAC", () => {
        it("401 → unauthenticated", async () => {
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[0];
            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .send({ label: "X" })
                .expect(401);
        });

        it("403 → unauthorized role", async () => {
            const t = customer();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[0];
            await request(app)
                .patch(`/categories/${cat._id}/attributes/${attr.id}/options/${opt.id}`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ label: "X" })
                .expect(403);
        });
    });
});
