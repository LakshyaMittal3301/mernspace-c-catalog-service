import { param, body } from "express-validator";

export const createProductModificationValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),

    // basic shape
    body().custom((v) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Request body must be an object");
        return true;
    }),

    body("name").isString().trim().notEmpty().withMessage("name is required"),
    body("kind").isIn(["radio", "checkbox"]).withMessage("Invalid modification kind"),

    // options
    body("options").isArray({ min: 1 }).withMessage("options must be a non-empty array"),
    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),
    body("options.*.price").isFloat({ min: 0 }).withMessage("option price must be >= 0"),

    // forbid system fields
    body("id").custom((v) => {
        if (v !== undefined) throw new Error("id is server-generated");
        return true;
    }),
    body("options.*.id").custom((v) => {
        if (v !== undefined) throw new Error("option.id is server-generated");
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

    // radio-specific
    body("isBase").optional().isBoolean().toBoolean(),
    body("defaultOptionIndex").optional().isInt({ min: 0 }).toInt(),

    // checkbox-specific
    body("minSelected").optional().isInt({ min: 0 }).toInt(),
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // cross-field checks
    body().custom((v) => {
        const kind = v.kind as "radio" | "checkbox";
        const opts = Array.isArray(v.options) ? v.options : [];

        if (kind === "radio") {
            if (v.isBase === true && v.defaultOptionIndex == null) {
                throw new Error("Base radio requires defaultOptionIndex");
            }
            if (
                v.defaultOptionIndex != null &&
                !(
                    Number.isInteger(v.defaultOptionIndex) &&
                    v.defaultOptionIndex >= 0 &&
                    v.defaultOptionIndex < opts.length
                )
            ) {
                throw new Error("defaultOptionIndex out of range");
            }
            if (v.minSelected != null || v.maxSelected != null) {
                throw new Error("minSelected/maxSelected apply only to checkbox");
            }
        }

        if (kind === "checkbox") {
            if (v.isBase === true) throw new Error("checkbox cannot be base");
            const min = v.minSelected ?? 0;
            const max = v.maxSelected ?? opts.length;
            if (!Number.isInteger(min) || min < 0) throw new Error("minSelected must be ≥ 0");
            if (!Number.isInteger(max) || max < 0) throw new Error("maxSelected must be ≥ 0");
            if (min > max) throw new Error("minSelected cannot be greater than maxSelected");
            if (max > opts.length) throw new Error("maxSelected cannot exceed number of options");
            if (v.defaultOptionIndex != null) throw new Error("checkbox does not support defaultOptionIndex");
        }

        return true;
    }),
];
