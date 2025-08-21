import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";
import { CreateCategoryDto, PublicCategoryDto } from "./category.dto";
import { DuplicateCategoryNameError } from "./category.errors";
import createHttpError from "http-errors";

export default class CategoryController {
    constructor(
        private logger: Logger,
        private categoryService: ICategoryService,
    ) {}

    create = async (req: Request<{}, PublicCategoryDto, CreateCategoryDto>, res: Response) => {
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
}
