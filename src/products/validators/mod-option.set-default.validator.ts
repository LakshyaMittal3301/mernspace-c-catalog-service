import { param, body } from "express-validator";

export const setModOptionDefaultValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),
    body().custom((v) => {
        if (v && Object.keys(v).length) throw new Error("Request body must be empty");
        return true;
    }),
];
