// src/categories/validators/attribute.create.validator.ts
import { param, body } from "express-validator";

export const createAttributeValidator = [
    // Path param
    param("id").isMongoId().withMessage("Invalid category id"),

    // Basic shape
    body().custom((v) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) {
            throw new Error("Request body must be an object");
        }
        return true;
    }),
    body("name").isString().trim().notEmpty().withMessage("Attribute name is required"),
    body("kind").isIn(["radio", "checkbox", "switch"]).withMessage("Invalid attribute kind"),

    body("options").isArray({ min: 1 }).withMessage("options must be a non-empty array"),
    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),

    // Forbid system/immutable fields coming from client
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

    // Coerce primitives first so cross-field checks see proper types
    body("defaultOptionIndex").optional().isInt({ min: 0 }).toInt(),
    body("isRequired").optional().isBoolean().toBoolean(),
    body("minSelected").optional().isInt({ min: 0 }).toInt(),
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // Cross-field/domain rules
    body().custom((v) => {
        const kind = v.kind as "radio" | "checkbox" | "switch";
        const opts = Array.isArray(v.options) ? v.options : [];
        const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < opts.length;

        // radio
        if (kind === "radio") {
            if (v.defaultOptionIndex !== undefined && !inRange(v.defaultOptionIndex)) {
                throw new Error("defaultOptionIndex out of range for radio");
            }
            if (v.minSelected !== undefined || v.maxSelected !== undefined) {
                throw new Error("minSelected/maxSelected apply only to checkbox");
            }
            // isRequired is allowed for radio (optional)
        }

        // switch
        if (kind === "switch") {
            if (opts.length !== 2) {
                throw new Error("switch must have exactly 2 options");
            }
            if (v.defaultOptionIndex === undefined) {
                throw new Error("defaultOptionIndex is required for switch");
            }
            if (!(v.defaultOptionIndex === 0 || v.defaultOptionIndex === 1)) {
                throw new Error("defaultOptionIndex must be 0 or 1 for switch");
            }
            if (v.isRequired !== undefined) {
                throw new Error("isRequired applies only to radio");
            }
            if (v.minSelected !== undefined || v.maxSelected !== undefined) {
                throw new Error("minSelected/maxSelected apply only to checkbox");
            }
        }

        // checkbox
        if (kind === "checkbox") {
            if (v.defaultOptionIndex !== undefined) {
                throw new Error("checkbox does not support defaultOptionIndex");
            }
            const min = v.minSelected ?? 0;
            const max = v.maxSelected ?? opts.length;
            if (!Number.isInteger(min) || min < 0) throw new Error("minSelected must be an integer ≥ 0");
            if (!Number.isInteger(max) || max < 0) throw new Error("maxSelected must be an integer ≥ 0");
            if (min > max) throw new Error("minSelected cannot be greater than maxSelected");
            if (max > opts.length) throw new Error("maxSelected cannot exceed number of options");
            if (v.isRequired !== undefined) {
                throw new Error("isRequired applies only to radio");
            }
        }

        return true;
    }),
];
