import { Model } from "mongoose";
import { CreateCategoryDto, PublicCategoryDto } from "./category.dto";
import { toPublicCategoryDto } from "./category.mapper";
import { Category } from "./category.types";

export interface ICategoryService {
    create(dto: CreateCategoryDto): Promise<PublicCategoryDto>;
}

export class CategoryService implements ICategoryService {
    constructor(private categoryModel: Model<Category>) {}

    create = async (dto: CreateCategoryDto): Promise<PublicCategoryDto> => {
        const created = await this.categoryModel.create(dto);
        return toPublicCategoryDto(created);
    };
}
