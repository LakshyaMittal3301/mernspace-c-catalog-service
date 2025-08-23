import { param, body } from "express-validator";

export const addPresetOptionsValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),

    body().custom((_, { req }) => {
        const b = req.body;
        if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Body must be an object");
        if (!Array.isArray(b.options) || b.options.length < 1) throw new Error("options must be a non-empty array");
        const bad = Object.keys(b).filter((k) => k !== "options");
        if (bad.length) throw new Error(`Field(s) not allowed: ${bad.join(", ")}`);
        return true;
    }),

    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),
];
