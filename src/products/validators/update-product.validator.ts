import { param, body } from "express-validator";

export const updateProductValidator = [
    // params
    param("id").isMongoId().withMessage("Invalid product id"),

    // non-empty body
    body().custom((v) => {
        if (!v || !Object.keys(v).length) throw new Error("Request body cannot be empty");
        return true;
    }),

    // allowed fields
    body("name").optional().isString().trim().notEmpty(),
    body("description").optional().isString().trim().notEmpty(),
    body("status").optional().isIn(["draft", "active", "archived"]),
    body("categoryId").optional().isMongoId().withMessage("Invalid category id"),

    body("image").optional().isObject(),
    body("image.key").optional().isString().trim().notEmpty(),
    body("image.url").optional().isString().trim().notEmpty(), // will be ignored if present

    // attributeValues (replace-set semantics)
    body("attributeValues").optional().isArray(),
    body("attributeValues.*.defId").optional().isString().trim().notEmpty(),
    body("attributeValues.*.kind").optional().isIn(["checkbox", "radio", "switch"]),
    body("attributeValues.*.selectedOptionId").optional().isString().trim().notEmpty(),
    body("attributeValues.*.selectedOptionIds").optional().isArray(),
    body("attributeValues.*.selectedOptionIds.*").optional().isString().trim().notEmpty(),

    // forbid fields not editable here
    body("tenantId").custom((v) => {
        if (v !== undefined) throw new Error("tenantId is immutable");
        return true;
    }),
    body("id").custom((v) => {
        if (v !== undefined) throw new Error("id is immutable");
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
    body("modifications").custom((v) => {
        if (v !== undefined) throw new Error("modifications cannot be changed here");
        return true;
    }),

    // cross-field UX checks (model remains source of truth)
    body().custom((v) => {
        if (v.image && !v.image.key) throw new Error("image.key is required when image is provided");
        return true;
    }),
];
