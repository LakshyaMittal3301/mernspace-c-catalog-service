import express, { Request, Response } from "express";
import authenticate from "../common/middlewares/authenticate";
import { canAccess } from "../common/middlewares/canAccess";
import { Roles } from "../common/constants";
import { handleValidation } from "../common/validators/handleValidation";
import ProductController from "./product.controller";
import { ProductService } from "./product.service";
import logger from "../config/logger";
import { ProductModel } from "./product.model";
import { AuthenticatedRequest } from "../common/types";
import { createProductValidator } from "./validators/create-product.validator";

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
    (req, res) => controller.create(req as AuthenticatedRequest, res),
);
export default router;
