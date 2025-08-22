import { checkSchema } from "express-validator";

export const updateCategoryValidator = checkSchema({}, ["body"]);
