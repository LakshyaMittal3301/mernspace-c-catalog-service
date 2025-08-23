import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";
import {
    CreateCategoryDto,
    GetCategoryDto,
    ListCategoryDto,
    PublicCategoryDto,
    UpdateCategoryDto,
} from "./category.dto";
import { CategoryArchivedError, CategoryNotFoundError, DuplicateCategoryNameError } from "./category.errors";
import createHttpError from "http-errors";
import { isAdmin } from "../common/utils";
import { matchedData } from "express-validator";

export default class CategoryController {
    constructor(
        private logger: Logger,
        private categoryService: ICategoryService,
    ) {}

    create = async (req: Request<{}, { category: PublicCategoryDto }, CreateCategoryDto>, res: Response) => {
        try {
            const createCategoryDto = req.body;
            const category = await this.categoryService.create(createCategoryDto);
            res.status(201).json({ category });
        } catch (err) {
            if (err instanceof DuplicateCategoryNameError) {
                this.logger.error("Duplicate Category Name", { error: err });
                throw createHttpError(409, err.message);
            }
            this.logger.error("Error while creating category", { error: err });
            throw err;
        }
    };

    update = async (
        req: Request<{ id: string }, { category: PublicCategoryDto }, UpdateCategoryDto>,
        res: Response,
    ) => {
        try {
            const category = await this.categoryService.update(req.params.id, req.body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof DuplicateCategoryNameError) throw createHttpError(409, err.message);
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            this.logger.error("Error updating the category", { error: err });
            throw err;
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response) => {
        try {
            const id = req.params.id;
            await this.categoryService.softDelete(id);
            res.sendStatus(204);
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            this.logger.error("Error while deleting the category", { errror: err });
            throw err;
        }
    };

    list = async (req: Request<{}, { categories: PublicCategoryDto[] }, {}>, res: Response) => {
        try {
            const queryData = matchedData(req, { locations: ["query"], onlyValidData: true }) as {
                includeDeleted?: boolean;
            };

            const listCategoryDto: ListCategoryDto = {
                includeDeleted: isAdmin(req) ? (queryData.includeDeleted ?? false) : false,
            };
            const categories = await this.categoryService.list(listCategoryDto);
            res.status(200).json({ categories });
        } catch (err) {
            this.logger.error("Error while fetching categories", { error: err });
            throw err;
        }
    };

    get = async (req: Request<{ id: string }, { category: PublicCategoryDto }, {}>, res: Response) => {
        try {
            const data = matchedData(req, {
                locations: ["params", "query"],
                onlyValidData: true,
                includeOptionals: true,
            }) as {
                id: string;
                includeDeleted?: boolean;
            };

            const getCategoryDto: GetCategoryDto = {
                includeDeleted: isAdmin(req) ? (data.includeDeleted ?? false) : false,
            };

            const category = await this.categoryService.get(req.params.id, getCategoryDto);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) {
                if (isAdmin(req)) throw createHttpError(409, "Category is archived");
                throw createHttpError(404, "Category not found");
            }
            this.logger.error("Error while fetching category");
            throw err;
        }
    };
}
