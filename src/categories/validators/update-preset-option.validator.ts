// src/categories/validators/preset.options.update.validator.ts
import { param, body } from "express-validator";

export const updatePresetOptionValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),

    body().custom((_, { req }) => {
        const b = req.body;
        if (!b || typeof b !== "object" || Array.isArray(b) || !Object.keys(b).length) {
            throw new Error("Request body cannot be empty");
        }
        const bad = Object.keys(b).filter((k) => k !== "label");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),
    body("label").isString().trim().notEmpty().withMessage("label is required"),
];
