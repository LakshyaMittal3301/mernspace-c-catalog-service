import { query } from "express-validator";

export const listCategoriesValidator = query("includeDeleted")
    .optional()
    .isBoolean()
    .withMessage("includeDeleted must be boolean")
    .toBoolean();
