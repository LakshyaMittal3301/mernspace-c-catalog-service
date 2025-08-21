import { Model } from "mongoose";
import { CreateCategoryDto, PublicCategoryDto } from "./category.dto";
import { toPublicCategoryDto } from "./category.mapper";
import { Category } from "./category.types";
import { DuplicateCategoryNameError } from "./category.errors";

export interface ICategoryService {
    create(dto: CreateCategoryDto): Promise<PublicCategoryDto>;
}

export class CategoryService implements ICategoryService {
    constructor(private categoryModel: Model<Category>) {}

    async create(dto: CreateCategoryDto): Promise<PublicCategoryDto> {
        try {
            const created = await this.categoryModel.create(dto);
            return toPublicCategoryDto(created);
        } catch (err: any) {
            if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
                throw new DuplicateCategoryNameError(dto.name);
            }
            throw err;
        }
    }
}
