import { param } from "express-validator";

export const deleteProductValidator = [param("id").isMongoId().withMessage("Invalid product id")];
