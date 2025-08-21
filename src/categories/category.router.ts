import express, { Request, Response } from "express";
import { createCategoryValidator } from "./category.validator";
import { handleValidation } from "../common/validators/handleValidation";
import CategoryController from "./category.controller";
import { CategoryService } from "./category.service";
import logger from "../config/logger";
import { CategoryModel } from "./category.model";

const categoryService = new CategoryService(CategoryModel);
const controller = new CategoryController(logger, categoryService);

const router = express.Router();

router.post("/", createCategoryValidator, handleValidation, controller.create);

export default router;
