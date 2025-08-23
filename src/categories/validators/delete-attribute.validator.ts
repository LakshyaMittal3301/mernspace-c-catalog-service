import { param, body } from "express-validator";

export const deleteAttributeValidator = [
    param("id").isMongoId().withMessage("Invalid category id"),
    param("attrId").isString().trim().notEmpty().withMessage("Invalid attribute id"),

    // Optional: reject accidental body payloads
    body().custom((v, { req }) => {
        if (req.body && Object.keys(req.body).length > 0) {
            throw new Error("Request body must be empty for DELETE");
        }
        return true;
    }),
];
