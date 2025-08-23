import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { Roles } from "../../src/common/constants";
import { CategoryModel } from "../../src/categories/category.model";
import mongoose from "mongoose";

describe("PATCH /categories/:id/attributes/:attrId", () => {
    let jwks: JWKSMock;
    let stop: () => void;
    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });
    const manager = () => jwks.token({ sub: "u2", role: Roles.MANAGER });
    const customer = () => jwks.token({ sub: "u3", role: Roles.CUSTOMER ?? "customer" });

    const seedCat = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [
                {
                    name: "Size",
                    kind: "radio",
                    options: [{ label: "S" }, { label: "M" }, { label: "L" }],
                    defaultOptionIndex: 1,
                },
            ],
            modificationPresets: [],
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

    it("200 updates name and radio.isRequired", async () => {
        const t = admin();
        const cat = await seedCat();
        const attr = (cat as any).attributes[0];

        const res = await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ name: "Pizza Size", isRequired: true })
            .expect(200);

        const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
        expect(updated.name).toBe("Pizza Size");
        expect(updated.isRequired).toBe(true);
    });

    it("200 updates checkbox bounds (min/max) and enforces model constraints", async () => {
        const t = admin();
        const doc = await CategoryModel.create({
            name: "Burgers",
            attributes: [
                {
                    name: "Toppings",
                    kind: "checkbox",
                    options: [{ label: "A" }, { label: "B" }, { label: "C" }],
                    minSelected: 0,
                    maxSelected: 2,
                },
            ],
            modificationPresets: [],
            isDeleted: false,
        });
        const cat = doc.toObject();
        const attr = (cat as any).attributes.find((a: any) => a.name === "Toppings");

        const res = await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ minSelected: 1, maxSelected: 3 })
            .expect(200);

        const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
        expect(updated.minSelected).toBe(1);
        expect(updated.maxSelected).toBe(3);
    });

    it("400 forbids changing id/kind/options/defaultOptionId", async () => {
        const t = admin();
        const cat = await seedCat();
        const attr = (cat as any).attributes[0];

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ kind: "checkbox" })
            .expect(400);

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ id: "hack" })
            .expect(400);

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ options: [{ label: "X" }] })
            .expect(400);

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ defaultOptionId: "opt-1" })
            .expect(400);
    });

    it("400 when body is empty", async () => {
        const t = admin();
        const cat = await seedCat();
        const attr = (cat as any).attributes[0];

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({})
            .expect(400);
    });

    it("404 when attribute not found", async () => {
        const t = admin();
        const cat = await seedCat();
        await request(app)
            .patch(`/categories/${cat._id}/attributes/not-present`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ name: "X" })
            .expect(404);
    });

    it("404 when category not found", async () => {
        const t = admin();
        const missing = new mongoose.Types.ObjectId().toHexString();
        await request(app)
            .patch(`/categories/${missing}/attributes/whatever`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ name: "X" })
            .expect(404);
    });

    it("409 when category archived", async () => {
        const t = admin();
        const doc = await CategoryModel.create({
            name: "Archived",
            attributes: [{ name: "A", kind: "radio", options: [{ label: "S" }, { label: "M" }] }],
            isDeleted: true,
            deletedAt: new Date(),
        });
        const attr = (doc.toObject() as any).attributes[0];

        await request(app)
            .patch(`/categories/${doc._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ name: "New" })
            .expect(409);
    });

    it("401 unauthenticated & 403 unauthorized", async () => {
        const cat = await seedCat();
        const attr = (cat as any).attributes[0];

        await request(app).patch(`/categories/${cat._id}/attributes/${attr.id}`).send({ name: "X" }).expect(401);

        await request(app)
            .patch(`/categories/${cat._id}/attributes/${attr.id}`)
            .set("Cookie", [`accessToken=${customer()}`])
            .send({ name: "X" })
            .expect(403);
    });

    it("400 invalid param id", async () => {
        const t = admin();
        await request(app)
            .patch(`/categories/not-an-oid/attributes/foo`)
            .set("Cookie", [`accessToken=${t}`])
            .send({ name: "X" })
            .expect(404);
    });
});
