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
import { listCategoriesValidator } from "./validators/list-category.validator";
import { getCategoryValidator } from "./validators/get-category.validator";
import { createAttributeValidator } from "./validators/create-attribute.validator";
import { updateAttributeValidator } from "./validators/update-attribute.validator";
import { deleteAttributeValidator } from "./validators/delete-attribute.validator";

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

router.get(
    "/",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    listCategoriesValidator,
    handleValidation,
    controller.list,
);

router.get(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    ...getCategoryValidator,
    handleValidation,
    controller.get,
);

router.post(
    "/:id/attributes",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...createAttributeValidator,
    handleValidation,
    controller.addAttribute,
);

router.patch(
    "/:id/attributes/:attrId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...updateAttributeValidator,
    handleValidation,
    controller.updateAttribute,
);

router.delete(
    "/:id/attributes/:attrId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...deleteAttributeValidator,
    handleValidation,
    controller.deleteAttribute,
);

export default router;
