import { param, body } from "express-validator";

export const setModificationBaseValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),
    // No body expected
    body().custom((v) => {
        if (v && Object.keys(v).length) throw new Error("Request body must be empty");
        return true;
    }),
];
