import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";
import { CreateCategoryDto, PublicCategoryDto } from "./category.dto";

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
            this.logger.info("Error while creating category", { error: err });
            throw err;
        }
    };
}
