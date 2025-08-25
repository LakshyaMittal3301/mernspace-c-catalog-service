import { param, body } from "express-validator";

export const updateProductModificationValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    param("modId").isString().trim().notEmpty().withMessage("Invalid modification id"),

    body().custom((v) => {
        if (!v || !Object.keys(v).length) throw new Error("Request body cannot be empty");
        return true;
    }),

    // allowed fields
    body("name").optional().isString().trim().notEmpty(),
    body("isRequired").optional().isBoolean().toBoolean(), // radio only
    body("minSelected").optional().isInt({ min: 0 }).toInt(), // checkbox only
    body("maxSelected").optional().isInt({ min: 0 }).toInt(),

    // forbid immutable/system fields and unrelated edits
    body("id").custom((v) => {
        if (v !== undefined) throw new Error("id is immutable");
        return true;
    }),
    body("kind").custom((v) => {
        if (v !== undefined) throw new Error("kind is immutable");
        return true;
    }),
    body("isBase").custom((v) => {
        if (v !== undefined) throw new Error("isBase cannot be changed here");
        return true;
    }),
    body("options").custom((v) => {
        if (v !== undefined) throw new Error("options cannot be changed here");
        return true;
    }),
    body("defaultOptionId").custom((v) => {
        if (v !== undefined) throw new Error("defaultOptionId cannot be set here");
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

    // cross-field UI check (model is authoritative)
    body().custom((v) => {
        if (v.minSelected != null && v.maxSelected != null && v.minSelected > v.maxSelected) {
            throw new Error("minSelected cannot be greater than maxSelected");
        }
        return true;
    }),
];
