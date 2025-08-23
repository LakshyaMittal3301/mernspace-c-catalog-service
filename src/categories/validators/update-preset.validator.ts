// src/categories/validators/update-preset.validator.ts
import { param, body } from "express-validator";

const ALLOWED = new Set(["name", "isRequired", "minSelected", "maxSelected"]);

export const updatePresetValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),

    // Non-empty body & only allowed keys
    body().custom((_, { req }) => {
        const b = req.body;
        if (!b || typeof b !== "object" || Array.isArray(b) || !Object.keys(b).length) {
            throw new Error("Request body cannot be empty");
        }
        const bad = Object.keys(b).filter((k) => !ALLOWED.has(k));
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),

    // Field types
    body("name").optional().isString().trim().notEmpty(),
    body("isRequired").optional().isBoolean().toBoolean(),
    body("minSelected").optional().isInt({ min: 0 }).toInt(),
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // Cross-field sanity (service will do authoritative checks)
    body().custom((_, { req }) => {
        const { minSelected, maxSelected } = req.body;
        if (minSelected != null && maxSelected != null && Number(minSelected) > Number(maxSelected)) {
            throw new Error("minSelected cannot be greater than maxSelected");
        }
        return true;
    }),
];
