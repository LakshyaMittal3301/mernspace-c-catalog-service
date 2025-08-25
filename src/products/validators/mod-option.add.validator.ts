import { param, body } from "express-validator";

export const addModOptionsValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),

    body().custom((v) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Request body must be an object");
        return true;
    }),
    body("options").isArray({ min: 1 }).withMessage("options must be a non-empty array"),
    body("options.*.label").isString().trim().notEmpty().withMessage("option label is required"),
    body("options.*.price").isInt({ min: 0 }).withMessage("option price must be an integer ≥ 0").toInt(),

    // forbid server fields
    body("options.*.id").custom((v) => {
        if (v !== undefined) throw new Error("option.id is server-generated");
        return true;
    }),
    body("options.*.isDeleted").custom((v) => {
        if (v !== undefined) throw new Error("option.isDeleted cannot be set");
        return true;
    }),
    body("options.*.deletedAt").custom((v) => {
        if (v !== undefined) throw new Error("option.deletedAt cannot be set");
        return true;
    }),
];
