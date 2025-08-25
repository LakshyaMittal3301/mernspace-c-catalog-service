// src/products/validators/mod-option.delete.validator.ts
import { param, body } from "express-validator";

export const deleteProductModOptionValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),
    // DELETE must have an empty body
    body().custom((v) => {
        if (v && Object.keys(v).length) throw new Error("Request body must be empty");
        return true;
    }),
];
