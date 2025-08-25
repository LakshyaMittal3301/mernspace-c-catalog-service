import express from "express";
import authenticate from "../common/middlewares/authenticate";
import { canAccess } from "../common/middlewares/canAccess";
import { Roles } from "../common/constants";
import { handleValidation } from "../common/validators/handleValidation";
import ProductController from "./product.controller";
import { ProductService } from "./product.service";
import logger from "../config/logger";
import { ProductModel } from "./product.model";
import { createProductValidator } from "./validators/create-product.validator";
import { updateProductValidator } from "./validators/update-product.validator";
import { deleteProductValidator } from "./validators/delete-product.validator";
import { listProductsValidator } from "./validators/list-products.validator";
import { getProductValidator } from "./validators/get-product.validator";
import { deleteProductModificationValidator } from "./validators/delete-modification.validator";
import { updateProductModificationValidator } from "./validators/update-modification.validator";
import { createProductModificationValidator } from "./validators/create-modification.validator";
import { setModificationBaseValidator } from "./validators/set-modification.validator";
import { addModOptionsValidator } from "./validators/mod-option.add.validator";
import { updateModOptionValidator } from "./validators/mod-option.update.validator";
import { setModOptionDefaultValidator } from "./validators/mod-option.set-default.validator";
import { deleteProductModOptionValidator } from "./validators/mod-option.delete.validator";

// Service
const productService = new ProductService(ProductModel);

// Controller
const controller = new ProductController(logger, productService);

// Router
const router = express.Router();

router.post(
    "/",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    ...createProductValidator,
    handleValidation,
    controller.create,
);

router.patch(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    updateProductValidator,
    handleValidation,
    controller.update,
);

router.delete(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    deleteProductValidator,
    handleValidation,
    controller.delete,
);

router.get(
    "/",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    listProductsValidator,
    handleValidation,
    controller.list,
);

router.get(
    "/:id",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    getProductValidator,
    handleValidation,
    controller.get,
);

router.post(
    "/:id/modifications",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    createProductModificationValidator,
    handleValidation,
    controller.addModification,
);

router.patch(
    "/:id/modifications/:modId",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    updateProductModificationValidator,
    handleValidation,
    controller.updateModification,
);

router.delete(
    "/:id/modifications/:modId",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    deleteProductModificationValidator,
    handleValidation,
    controller.deleteModification,
);

router.post(
    "/:id/modifications/:modId/base",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    setModificationBaseValidator,
    handleValidation,
    controller.setBaseModification,
);

router.post(
    "/:id/modifications/:modId/options",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    addModOptionsValidator,
    handleValidation,
    controller.addModificationOptions,
);

router.patch(
    "/:id/modifications/:modId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    updateModOptionValidator,
    handleValidation,
    controller.updateModificationOption,
);

router.delete(
    "/:id/modifications/:modId/options/:optId",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    deleteProductModOptionValidator,
    handleValidation,
    controller.deleteModificationOption,
);

router.post(
    "/:id/modifications/:modId/options/:optId/default",
    authenticate,
    canAccess([Roles.ADMIN, Roles.MANAGER]),
    setModOptionDefaultValidator,
    handleValidation,
    controller.setModificationDefaultOption,
);

export default router;
