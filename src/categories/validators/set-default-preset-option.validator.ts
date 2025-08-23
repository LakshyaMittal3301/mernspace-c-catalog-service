// src/categories/validators/preset.options.default.validator.ts
import { param, body } from "express-validator";

export const setPresetDefaultValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),

    body().custom((_, { req }) => {
        const b = req.body;
        if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Body must be an object");
        const bad = Object.keys(b).filter((k) => k !== "optionId");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),
    // accept string or null; service enforces kind-specific rules
    body("optionId")
        .custom((v) => (typeof v === "string" && v.trim().length > 0) || v === null)
        .withMessage("optionId must be a string id or null"),
];
