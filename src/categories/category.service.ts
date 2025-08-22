import { Model } from "mongoose";
import { CreateCategoryDto, PublicCategoryDto, UpdateCategoryDto } from "./category.dto";
import { toPublicCategoryDto } from "./category.mapper";
import { Category } from "./category.types";
import { CategoryArchivedError, CategoryNotFoundError, DuplicateCategoryNameError } from "./category.errors";

export interface ICategoryService {
    create(dto: CreateCategoryDto): Promise<PublicCategoryDto>;
    update(id: string, dto: UpdateCategoryDto): Promise<PublicCategoryDto>;
}

export class CategoryService implements ICategoryService {
    constructor(private categoryModel: Model<Category>) {}

    async create(dto: CreateCategoryDto): Promise<PublicCategoryDto> {
        try {
            const data = {
                name: dto.name,
                attributes: dto.attributes,
                modificationPresets: dto.modificationPresets,
            };
            const created = await this.categoryModel.create(data);
            return toPublicCategoryDto(created);
        } catch (err: any) {
            if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
                throw new DuplicateCategoryNameError(dto.name);
            }
            throw err;
        }
    }

    async update(id: string, dto: UpdateCategoryDto): Promise<PublicCategoryDto> {
        const $set: Partial<Category> = {};
        if (dto.name !== undefined) $set.name = dto.name;

        try {
            const updated = await this.categoryModel.findOneAndUpdate(
                { _id: id, isDeleted: false },
                { $set },
                { new: true, runValidators: true, context: "query" },
            );

            if (!updated) {
                const exists = await this.categoryModel.exists({ _id: id });
                if (!exists) throw new CategoryNotFoundError(id);
                throw new CategoryArchivedError(id);
            }

            return toPublicCategoryDto(updated);
        } catch (err: any) {
            if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
                throw new DuplicateCategoryNameError($set.name ?? "");
            }
            throw err;
        }
    }
}
