import { body } from "express-validator";

/**
 * POST /products
 * - Light shape checks; deep invariants are enforced in ProductSchema pre('validate')
 * - Accepts defaultOptionIndex (server maps to defaultOptionId in model)
 * - Forbids server-owned fields
 */
export const createProductValidator = [
    // Base fields
    body("name").isString().trim().notEmpty().withMessage("name is required"),
    body("description").isString().trim().notEmpty().withMessage("description is required"),
    body("categoryId").isString().trim().notEmpty().withMessage("categoryId is required"),
    body("status").optional().isIn(["draft", "active", "archived"]).withMessage("invalid status"),

    // tenantId is optional here (validated in controller by role)
    body("tenantId").optional().isString().trim().notEmpty(),

    // Image
    body("image").optional().isObject(),
    body("image.key").optional().isString().trim().notEmpty(),
    body("image.url").optional().isString().trim().notEmpty(),

    // Attribute values (shallow validation)
    body("attributeValues").optional().isArray(),
    body("attributeValues.*.defId").optional().isString().trim().notEmpty(),
    body("attributeValues.*.kind").optional().isIn(["checkbox", "radio", "switch"]),
    body("attributeValues.*.selectedOptionId").optional().isString(), // radio/switch
    body("attributeValues.*.selectedOptionIds").optional().isArray(), // checkbox

    // Modifications (shallow validation)
    body("modifications").isArray({ min: 1 }).withMessage("modifications must contain at least one group"),

    body("modifications.*.name").isString().trim().notEmpty().withMessage("modification name is required"),
    body("modifications.*.kind").isIn(["radio", "checkbox"]).withMessage("invalid modification kind"),
    body("modifications.*.isBase").optional().isBoolean().toBoolean(),

    // Radio-specific
    body("modifications.*.defaultOptionIndex").optional().isInt({ min: 0 }).toInt(),
    body("modifications.*.defaultOptionId").custom((v) => {
        if (v !== undefined) throw new Error("defaultOptionId is server-resolved from defaultOptionIndex");
        return true;
    }),

    // Checkbox-specific
    body("modifications.*.minSelected").optional().isInt({ min: 0 }).toInt(),
    body("modifications.*.maxSelected").optional().isInt({ min: 0 }).toInt(),

    // Options
    body("modifications.*.options").isArray({ min: 1 }).withMessage("each modification must have at least one option"),
    body("modifications.*.options.*.label").isString().trim().notEmpty().withMessage("option label is required"),
    body("modifications.*.options.*.price").isInt({ min: 0 }).toInt().withMessage("option price must be integer ≥ 0"),

    // Forbid server/system fields at root
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

    // Cheap cross-field guards (full checks happen in model)
    body().custom((v) => {
        if (!v?.modifications?.length) return true;

        const radios = v.modifications.filter((m: any) => m.kind === "radio" && m.isDeleted !== true);
        const baseCount = radios.filter((m: any) => m.isBase === true).length;
        if (baseCount !== 1) {
            throw new Error("Exactly one radio modification must have isBase=true");
        }

        for (const m of v.modifications) {
            if (m.kind === "checkbox" && m.isBase === true) {
                throw new Error("checkbox modification cannot be base");
            }
            if (Array.isArray(m.options) && m.defaultOptionIndex != null) {
                const idx = m.defaultOptionIndex;
                if (idx < 0 || idx >= m.options.length) {
                    throw new Error(`defaultOptionIndex out of range for modification '${m.name}'`);
                }
            }
        }

        return true;
    }),
];
