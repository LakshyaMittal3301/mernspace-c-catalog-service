// src/categories/validators/attribute.options.update.validator.ts
import { param, body } from "express-validator";

export const updateAttributeOptionValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),

    body().custom((_, { req }) => {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new Error("Body must be an object");
        }
        const keys = Object.keys(req.body);
        if (!keys.length) throw new Error("Request body cannot be empty");
        const bad = keys.filter((k) => k !== "label");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),
    body("label").isString().trim().notEmpty().withMessage("label is required"),
];
