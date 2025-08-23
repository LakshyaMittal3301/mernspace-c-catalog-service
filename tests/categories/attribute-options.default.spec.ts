import request from "supertest";
import { createJWKSMock, JWKSMock } from "mock-jwks";
import app from "../../src/app";
import { startTestMongo, stopTestMongo, clearTestMongo } from "../mongo.testdb";
import { CategoryModel } from "../../src/categories/category.model";
import { Roles } from "../../src/common/constants";

describe("POST /categories/:id/attributes/:attrId/default (set default)", () => {
    let jwks: JWKSMock;
    let stop: () => void;

    const admin = () => jwks.token({ sub: "u1", role: Roles.ADMIN });

    const seedRadio = async () => {
        const doc = await CategoryModel.create({
            name: "Pizza",
            attributes: [{ name: "Size", kind: "radio", options: [{ label: "S" }, { label: "M" }, { label: "L" }] }], // no default
            isDeleted: false,
        });
        return doc.toObject();
    };

    const seedSwitch = async () => {
        const doc = await CategoryModel.create({
            name: "Pasta",
            attributes: [
                {
                    name: "Gluten Free",
                    kind: "switch",
                    options: [{ label: "Yes" }, { label: "No" }],
                    defaultOptionIndex: 0,
                },
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

    describe("Radio", () => {
        it("200 → set default to an existing, non-deleted option", async () => {
            const t = admin();
            const cat = await seedRadio();
            const attr = (cat as any).attributes[0];
            const opt = attr.options[2]; // L

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: opt.id })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            expect(updated.defaultOptionId).toBe(opt.id);
        });

        it("200 → clear default with null", async () => {
            const t = admin();
            const cat = await CategoryModel.create({
                name: "Sandwich",
                attributes: [
                    {
                        name: "Bread",
                        kind: "radio",
                        options: [{ label: "White" }, { label: "Brown" }],
                        defaultOptionIndex: 1,
                    },
                ],
                isDeleted: false,
            }).then((d) => d.toObject());

            const attr = (cat as any).attributes[0];

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            expect(updated.defaultOptionId).toBeUndefined();
        });
    });

    describe("Switch", () => {
        it("200 → set default to one of the two options (non-null)", async () => {
            const t = admin();
            const cat = await seedSwitch();
            const attr = (cat as any).attributes[0];
            const other = attr.options.find((o: any) => o.id !== attr.defaultOptionId);

            const res = await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: other.id })
                .expect(200);

            const updated = res.body.category.attributes.find((a: any) => a.id === attr.id);
            expect(updated.defaultOptionId).toBe(other.id);
        });

        it("400 → switch default cannot be null", async () => {
            const t = admin();
            const cat = await seedSwitch();
            const attr = (cat as any).attributes[0];

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(400);
        });

        it("404 → option not found or deleted", async () => {
            const t = admin();
            const cat = await seedSwitch();
            const attr = (cat as any).attributes[0];

            await request(app)
                .post(`/categories/${cat._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: "not-there" })
                .expect(404);
        });
    });

    describe("Common errors", () => {
        it("404 → attribute not found", async () => {
            const t = admin();
            const cat = await seedRadio();
            await request(app)
                .post(`/categories/${cat._id}/attributes/not-there/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(404);
        });

        it("404 → category not found", async () => {
            const t = admin();
            await request(app)
                .post(`/categories/66aabbccddeeff0011223344/attributes/attr/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(404);
        });

        it("409 → category archived", async () => {
            const t = admin();
            const doc = await CategoryModel.create({
                name: "Archived",
                attributes: [
                    { name: "X", kind: "radio", options: [{ label: "A" }, { label: "B" }], defaultOptionIndex: 0 },
                ],
                isDeleted: true,
                deletedAt: new Date(),
            });
            const attr = (doc.toObject() as any).attributes[0];
            await request(app)
                .post(`/categories/${doc._id}/attributes/${attr.id}/default`)
                .set("Cookie", [`accessToken=${t}`])
                .send({ optionId: null })
                .expect(409);
        });
    });
});
