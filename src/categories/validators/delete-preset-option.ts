// src/categories/validators/preset.options.delete.validator.ts
import { param, body } from "express-validator";

export const deletePresetOptionValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("presetId").isString().trim().notEmpty().withMessage("Invalid preset id"),
    param("optId").isString().trim().notEmpty().withMessage("Invalid option id"),
    body().custom((_, { req }) => {
        if (req.body && Object.keys(req.body).length > 0) throw new Error("Body must be empty");
        return true;
    }),
];
