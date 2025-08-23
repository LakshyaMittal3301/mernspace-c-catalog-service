import { Model } from "mongoose";
import {
    CreateAttributeInput,
    CreateCategoryDto,
    GetCategoryDto,
    ListCategoryDto,
    PublicCategoryDto,
    UpdateAttributeDto,
    UpdateCategoryDto,
} from "./category.dto";
import { toPublicCategoryDto } from "./category.mapper";
import { Category } from "./category.types";
import {
    AttributeNotFoundError,
    CategoryArchivedError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidOperationError,
} from "./category.errors";
import { AttributeDefinition } from "../core/types/attributes";

export interface ICategoryService {
    create(dto: CreateCategoryDto): Promise<PublicCategoryDto>;
    update(id: string, dto: UpdateCategoryDto): Promise<PublicCategoryDto>;
    softDelete(id: string): Promise<void>;
    list(dto: ListCategoryDto): Promise<PublicCategoryDto[]>;
    get(id: string, dto: GetCategoryDto): Promise<PublicCategoryDto>;
    addAttribute(id: string, dto: CreateAttributeInput): Promise<PublicCategoryDto>;
    updateAttribute(categoryId: string, attrId: string, dto: UpdateAttributeDto): Promise<PublicCategoryDto>;
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

    async softDelete(id: string): Promise<void> {
        const res = await this.categoryModel.updateOne(
            { _id: id, isDeleted: false },
            { $set: { isDeleted: true, deletedAt: new Date() } },
        );

        if (res.matchedCount === 1) return;
        const exists = await this.categoryModel.exists({ _id: id });
        if (!exists) throw new CategoryNotFoundError(id);
        return;
    }

    async list(dto: ListCategoryDto): Promise<PublicCategoryDto[]> {
        const filter = dto.includeDeleted ? {} : { isDeleted: false };
        const docs = await this.categoryModel.find(filter);

        return docs.map(toPublicCategoryDto);
    }

    async get(id: string, dto: GetCategoryDto): Promise<PublicCategoryDto> {
        const doc = await this.categoryModel.findById(id);
        if (!doc) throw new CategoryNotFoundError(id);
        if (!dto.includeDeleted && doc.isDeleted) throw new CategoryArchivedError(id);
        return toPublicCategoryDto(doc);
    }

    async addAttribute(id: string, dto: CreateAttributeInput): Promise<PublicCategoryDto> {
        const cat = await this.categoryModel.findById(id);
        if (!cat) throw new CategoryNotFoundError(id);
        if (cat.isDeleted) throw new CategoryArchivedError(id);
        (cat as any).attributes.push(dto);
        await cat.save();
        return toPublicCategoryDto(cat);
    }

    async updateAttribute(categoryId: string, attrId: string, dto: UpdateAttributeDto): Promise<PublicCategoryDto> {
        const cat = await this.loadCategoryForWrite(categoryId);
        const attribute = cat.attributes.find((x) => x.id === attrId && x.isDeleted !== true);
        if (!attribute) throw new AttributeNotFoundError(attrId);

        if ((dto as any).id !== undefined || (dto as any).kind !== undefined) {
            throw new InvalidOperationError("id/kind are immutable");
        }
        if ((dto as any).options !== undefined || (dto as any).defaultOptionId !== undefined) {
            throw new InvalidOperationError("options/defaultOptionId cannot be changed here");
        }

        this.applyAttributeUpdates(attribute, dto);

        await cat.save();
        return toPublicCategoryDto(cat);
    }

    private async loadCategoryForWrite(id: string) {
        const doc = await this.categoryModel.findById(id);
        if (!doc) throw new CategoryNotFoundError(id);
        if (doc.isDeleted) throw new CategoryArchivedError(id);
        return doc;
    }

    private applyAttributeUpdates(
        a: AttributeDefinition,
        dto: { name?: string; isRequired?: boolean; minSelected?: number; maxSelected?: number },
    ) {
        // common
        if (dto.name !== undefined) a.name = dto.name;

        switch (a.kind) {
            case "radio": {
                // allow only isRequired on radio
                if (dto.isRequired !== undefined) a.isRequired = dto.isRequired;
                // reject checkbox-only fields if present
                if (dto.minSelected !== undefined || dto.maxSelected !== undefined) {
                    throw new InvalidOperationError("minSelected/maxSelected apply only to checkbox attributes");
                }
                return;
            }

            case "checkbox": {
                // allow only min/max on checkbox
                if (dto.minSelected !== undefined) a.minSelected = dto.minSelected;
                if (dto.maxSelected !== undefined) a.maxSelected = dto.maxSelected;
                // reject radio-only field
                if (dto.isRequired !== undefined) {
                    throw new InvalidOperationError("isRequired applies only to radio attributes");
                }
                return;
            }

            case "switch": {
                // nothing extra is updatable on switch (besides name)
                if (dto.isRequired !== undefined || dto.minSelected !== undefined || dto.maxSelected !== undefined) {
                    throw new InvalidOperationError("Only 'name' can be updated on switch attributes");
                }
                return;
            }

            default:
                // exhaustive check for future kinds
                const _exhaustive: never = a;
                return _exhaustive;
        }
    }
}
