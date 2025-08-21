import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";

export default class CategoryController {
    constructor(
        private logger: Logger,
        private categoryService: ICategoryService,
    ) {}
    async create(req: Request, res: Response) {
        this.categoryService.create();
    }
}
