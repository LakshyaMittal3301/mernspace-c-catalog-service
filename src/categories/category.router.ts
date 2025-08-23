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
import { addAttributeOptionsValidator } from "./validators/add-attribute-options.validator";
import { updateAttributeOptionValidator } from "./validators/update-attribute-option.validator";
import { deleteAttributeOptionValidator } from "./validators/delete-attribute-option";
import { setAttributeDefaultValidator } from "./validators/set-default-option.validator";
import { createPresetValidator } from "./validators/create-preset.validator";
import { updatePresetValidator } from "./validators/update-preset.validator";
import { deletePresetValidator } from "./validators/delete-preset.validator";
import { addPresetOptionsValidator } from "./validators/add-preset-options.validator";
import { updatePresetOptionValidator } from "./validators/update-preset-option.validator";
import { deletePresetOptionValidator } from "./validators/delete-preset-option";
import { setPresetDefaultValidator } from "./validators/set-default-preset-option.validator";

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

router.post(
    "/:id/attributes/:attrId/options",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...addAttributeOptionsValidator,
    handleValidation,
    controller.addAttributeOptions,
);

router.patch(
    "/:id/attributes/:attrId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...updateAttributeOptionValidator,
    handleValidation,
    controller.updateAttributeOption,
);

router.delete(
    "/:id/attributes/:attrId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...deleteAttributeOptionValidator,
    handleValidation,
    controller.deleteAttributeOption,
);

router.post(
    "/:id/attributes/:attrId/default",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...setAttributeDefaultValidator,
    handleValidation,
    controller.setAttributeDefault,
);

router.post(
    "/:id/presets",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...createPresetValidator,
    handleValidation,
    controller.addPreset,
);

router.patch(
    "/:id/presets/:presetId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...updatePresetValidator,
    handleValidation,
    controller.updatePreset,
);

router.delete(
    "/:id/presets/:presetId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...deletePresetValidator,
    handleValidation,
    controller.deletePreset,
);

router.post(
    "/:id/presets/:presetId/options",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...addPresetOptionsValidator,
    handleValidation,
    controller.addPresetOptions,
);

router.patch(
    "/:id/presets/:presetId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...updatePresetOptionValidator,
    handleValidation,
    controller.updatePresetOption,
);

router.delete(
    "/:id/presets/:presetId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...deletePresetOptionValidator,
    handleValidation,
    controller.deletePresetOption,
);

router.post(
    "/:id/presets/:presetId/default",
    authenticate,
    canAccess([Roles.ADMIN]),
    ...setPresetDefaultValidator,
    handleValidation,
    controller.setPresetDefault,
);

export default router;
