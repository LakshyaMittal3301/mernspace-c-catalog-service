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
export default router;
