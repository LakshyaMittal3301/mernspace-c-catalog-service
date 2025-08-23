import { checkSchema, query } from "express-validator";

export const getCategoryValidator = [
    checkSchema({ id: { in: ["params"], isMongoId: { errorMessage: "Invalid category id" } } }, ["params"]),
    query("includeDeleted").optional().isBoolean().withMessage("includeDeleted must be boolean").toBoolean(),
];
