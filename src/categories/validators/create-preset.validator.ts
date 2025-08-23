import { param, body } from "express-validator";

export const createPresetValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),

    // Body shape
    body().custom((_, { req }) => {
        const v = req.body;
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Request body must be an object");
        return true;
    }),

    // Basic fields
    body("name").isString().trim().notEmpty().withMessage("Preset name is required"),
    body("kind").isIn(["radio", "checkbox"]).withMessage("Preset kind must be 'radio' or 'checkbox'"),

    // Options
    body("options").isArray({ min: 1 }).withMessage("options must be a non-empty array"),
    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),

    // Forbid system/immutable fields
    body("id").custom((v) => {
        if (v !== undefined) throw new Error("id is server-generated");
        return true;
    }),
    body("isDeleted").custom((v) => {
        if (v !== undefined) throw new Error("isDeleted cannot be set");
        return true;
    }),
    body("deletedAt").custom((v) => {
        if (v !== undefined) throw new Error("deletedAt cannot be set");
        return true;
    }),
    body("options.*.id").custom((v) => {
        if (v !== undefined) throw new Error("option.id is server-generated");
        return true;
    }),

    // Coercions
    body("defaultOptionIndex").optional().isInt({ min: 0 }).toInt(),
    body("isRequired").optional().isBoolean().toBoolean(),
    body("minSelected").optional().isInt({ min: 0 }).toInt(),
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // Cross-field rules
    body().custom((v) => {
        const kind = v.kind as "radio" | "checkbox";
        const opts = Array.isArray(v.options) ? v.options : [];
        const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < opts.length;

        if (kind === "radio") {
            if (v.defaultOptionIndex !== undefined && !inRange(v.defaultOptionIndex)) {
                throw new Error("defaultOptionIndex out of range for radio preset");
            }
            if (v.minSelected !== undefined || v.maxSelected !== undefined) {
                throw new Error("minSelected/maxSelected apply only to checkbox presets");
            }
            // isRequired allowed (optional)
        }

        if (kind === "checkbox") {
            if (v.defaultOptionIndex !== undefined || v.isRequired !== undefined) {
                throw new Error("checkbox presets do not support defaultOptionIndex/isRequired");
            }
            const min = v.minSelected ?? 0;
            const max = v.maxSelected ?? opts.length;
            if (!Number.isInteger(min) || min < 0) throw new Error("minSelected must be an integer ≥ 0");
            if (!Number.isInteger(max) || max < 0) throw new Error("maxSelected must be an integer ≥ 0");
            if (min > max) throw new Error("minSelected cannot be greater than maxSelected");
            if (max > opts.length) throw new Error("maxSelected cannot exceed number of options");
        }

        return true;
    }),
];
