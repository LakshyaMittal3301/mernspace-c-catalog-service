import express, { Request, Response } from "express";
import { createCategoryValidator } from "./validators/create-category.validator";
import { handleValidation } from "../common/validators/handleValidation";
import CategoryController from "./category.controller";
import { CategoryService } from "./category.service";
import logger from "../config/logger";
import { CategoryModel } from "./category.model";
import authenticate from "../common/middlewares/authenticate";
import { canAccess } from "../common/middlewares/canAccess";
import { Roles } from "../common/constants";
import { updateCategoryValidator } from "./validators/update-category.validator";
import { deleteCategoryValidator } from "./validators/delete-category.validator";

const categoryService = new CategoryService(CategoryModel);
const controller = new CategoryController(logger, categoryService);

const router = express.Router();

router.post("/", authenticate, canAccess([Roles.ADMIN]), createCategoryValidator, handleValidation, controller.create);

router.patch(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...updateCategoryValidator,
    handleValidation,
    controller.update,
);

router.delete(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN]),
    deleteCategoryValidator,
    handleValidation,
    controller.delete,
);
export default router;
