import { param, body } from "express-validator";

export const updateModOptionValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),

    body().custom((v) => {
        if (!v || !Object.keys(v).length) throw new Error("Request body cannot be empty");
        return true;
    }),
    body("label").optional().isString().trim().notEmpty(),
    body("price").optional().isInt({ min: 0 }).toInt(),

    // forbid server fields
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
];
