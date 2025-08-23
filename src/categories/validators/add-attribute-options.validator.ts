// src/categories/validators/attribute.options.add.validator.ts
import { param, body } from "express-validator";

export const addAttributeOptionsValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),

    body().custom((_, { req }) => {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new Error("Body must be an object");
        }
        if (!Array.isArray(req.body.options) || req.body.options.length < 1) {
            throw new Error("options must be a non-empty array");
        }
        const bad = Object.keys(req.body).filter((k) => k !== "options");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),

    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),
];
