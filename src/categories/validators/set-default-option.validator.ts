// src/categories/validators/attribute.options.default.validator.ts
import { param, body } from "express-validator";

export const setAttributeDefaultValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),

    body().custom((_, { req }) => {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new Error("Body must be an object");
        }
        const bad = Object.keys(req.body).filter((k) => k !== "optionId");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),
    // Accept string or null here; service will enforce per-kind rules
    body("optionId")
        .custom((v) => (typeof v === "string" && v.trim().length > 0) || v === null)
        .withMessage("optionId must be a string id or null"),
];
