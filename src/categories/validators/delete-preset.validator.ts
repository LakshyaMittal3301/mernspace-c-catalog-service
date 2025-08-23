// src/categories/validators/delete-preset.validator.ts
import { param, body } from "express-validator";

export const deletePresetValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),
    body().custom((_, { req }) => {
        if (req.body && Object.keys(req.body).length > 0) {
            throw new Error("Request body must be empty for DELETE");
        }
        return true;
    }),
];
