import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";
import { CreateCategoryDto, PublicCategoryDto, UpdateCategoryDto } from "./category.dto";
import { CategoryArchivedError, CategoryNotFoundError, DuplicateCategoryNameError } from "./category.errors";
import createHttpError from "http-errors";

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
}
