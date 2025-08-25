import { param, query } from "express-validator";

export const getProductValidator = [
    param("id").isMongoId().withMessage("Invalid product id"),
    query("includeDeleted").optional().isBoolean().toBoolean(),
];
