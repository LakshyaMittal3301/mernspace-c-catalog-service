// src/categories/validators/attribute.update.validator.ts
import { param, body } from "express-validator";

const ALLOWED = new Set(["name", "isRequired", "minSelected", "maxSelected"]);

export const updateAttributeValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),

    // Non-empty body using req.body (more reliable than v for objects)
    body().custom((_, { req }) => {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || !Object.keys(req.body).length) {
            throw new Error("Request body cannot be empty");
        }
        return true;
    }),

    // Allowed fields & coercions
    body("name").optional().isString().trim().notEmpty(),
    body("isRequired").optional().isBoolean().toBoolean(),
    body("minSelected").optional().isInt({ min: 0 }).toInt(),
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // Reject unknown/forbidden fields early (prevents matchedData from silently dropping them)
    body().custom((_, { req }) => {
        const keys = Object.keys(req.body);
        const bad = keys.filter((k) => !ALLOWED.has(k));
        if (bad.length) {
            throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        }
        return true;
    }),

    // Cross-field UX check (model still authoritative)
    body().custom((_, { req }) => {
        const { minSelected, maxSelected } = req.body ?? {};
        if (minSelected != null && maxSelected != null && Number(minSelected) > Number(maxSelected)) {
            throw new Error("minSelected cannot be greater than maxSelected");
        }
        return true;
    }),
];
