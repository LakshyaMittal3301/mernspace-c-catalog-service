// src/categories/validators/attribute.options.delete.validator.ts
import { param, body } from "express-validator";

export const deleteAttributeOptionValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),
    body().custom((_, { req }) => {
        if (req.body && Object.keys(req.body).length > 0) throw new Error("Body must be empty");
        return true;
    }),
];
