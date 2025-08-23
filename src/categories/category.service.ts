import { Model } from "mongoose";
import {
    AddAttributeOptionsDto,
    CreateAttributeInput,
    CreateCategoryDto,
    GetCategoryDto,
    ListCategoryDto,
    PublicCategoryDto,
    SetAttributeDefaultDto,
    UpdateAttributeDto,
    UpdateAttributeOptionDto,
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
    OptionNotFoundError,
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
    deleteAttribute(id: string, attrId: string): Promise<void>;
    addAttributeOptions(id: string, attrId: string, dto: AddAttributeOptionsDto): Promise<PublicCategoryDto>;
    updateAttributeOption(
        id: string,
        attrId: string,
        optId: string,
        dto: UpdateAttributeOptionDto,
    ): Promise<PublicCategoryDto>;
    deleteAttributeOption(id: string, attrId: string, optId: string): Promise<void>;
    setAttributeDefault(id: string, attrId: string, dto: SetAttributeDefaultDto): Promise<PublicCategoryDto>;
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

    async deleteAttribute(id: string, attrId: string): Promise<void> {
        const cat = await this.loadCategoryForWrite(id);
        const attribute = cat.attributes.find((x: any) => x.id === attrId);
        if (!attribute) throw new AttributeNotFoundError(attrId);

        if (attribute.isDeleted) return;

        attribute.isDeleted = true;
        attribute.deletedAt = new Date();
        await cat.save();
    }

    async addAttributeOptions(id: string, attrId: string, dto: AddAttributeOptionsDto): Promise<PublicCategoryDto> {
        const cat = await this.loadCategoryForWrite(id);
        const a = cat.attributes.find((x: any) => x.id === attrId && x.isDeleted !== true) as any;
        if (!a) throw new AttributeNotFoundError(attrId);

        if (a.kind === "switch") {
            const active = a.options.filter((o: any) => !o.isDeleted).length;
            if (active + dto.options.length > 2) {
                throw new InvalidOperationError("Switch must have exactly 2 options");
            }
        }

        dto.options.forEach((o) => a.options.push({ label: o.label }));

        await cat.save();
        return toPublicCategoryDto(cat);
    }

    async updateAttributeOption(
        id: string,
        attrId: string,
        optId: string,
        dto: UpdateAttributeOptionDto,
    ): Promise<PublicCategoryDto> {
        const cat = await this.loadCategoryForWrite(id);
        const a = cat.attributes.find((x: any) => x.id === attrId && x.isDeleted !== true) as any;
        if (!a) throw new AttributeNotFoundError(attrId);

        const o = a.options.find((x: any) => x.id === optId);
        if (!o) throw new OptionNotFoundError(optId);
        if (o.isDeleted) throw new OptionNotFoundError(optId); // treat deleted as missing for updates

        if ((dto as any).id !== undefined) throw new InvalidOperationError("option id is immutable");
        if ((dto as any).isDeleted !== undefined || (dto as any).deletedAt !== undefined) {
            throw new InvalidOperationError("isDeleted/deletedAt cannot be set");
        }

        o.label = dto.label;

        await cat.save();
        return toPublicCategoryDto(cat);
    }

    async deleteAttributeOption(id: string, attrId: string, optId: string): Promise<void> {
        const cat = await this.loadCategoryForWrite(id);
        const a = cat.attributes.find((x: any) => x.id === attrId) as any;
        if (!a) throw new AttributeNotFoundError(attrId);

        const o = a.options.find((x: any) => x.id === optId);
        if (!o) throw new OptionNotFoundError(optId);

        // For switch: enforce 2 active options
        const activeCount = a.options.filter((x: any) => !x.isDeleted).length;
        if (a.kind === "switch" && !o.isDeleted && activeCount <= 2) {
            // Deleting would leave <2 active; reject to keep invariant (admin should replace instead)
            throw new InvalidOperationError("Cannot delete switch option: switch must have exactly 2 active options");
        }

        // Idempotent soft-delete
        if (!o.isDeleted) {
            o.isDeleted = true;
            o.deletedAt = new Date();

            // Default semantics
            if ((a.kind === "radio" || a.kind === "switch") && a.defaultOptionId === o.id) {
                if (a.kind === "radio") {
                    a.defaultOptionId = undefined; // cleared
                } else {
                    // switch → reassign default to the other active option (should exist)
                    const other = a.options.find((x: any) => !x.isDeleted && x.id !== o.id);
                    if (other) a.defaultOptionId = other.id;
                }
            }
            await cat.save();
        }
    }

    async setAttributeDefault(
        categoryId: string,
        attrId: string,
        dto: SetAttributeDefaultDto,
    ): Promise<PublicCategoryDto> {
        const cat = await this.loadCategoryForWrite(categoryId);
        const a = cat.attributes.find((x: any) => x.id === attrId && x.isDeleted !== true) as
            | AttributeDefinition
            | undefined;
        if (!a) throw new AttributeNotFoundError(attrId);

        if (a.kind === "checkbox") {
            throw new InvalidOperationError("Checkbox does not support default option");
        }

        if (a.kind === "radio") {
            // allow null to clear
            if (dto.optionId === null) {
                (a as any).defaultOptionId = undefined;
            } else {
                const exists = (a as any).options.find((o: any) => o.id === dto.optionId && !o.isDeleted);
                if (!exists) throw new OptionNotFoundError(dto.optionId);
                (a as any).defaultOptionId = dto.optionId;
            }
        } else {
            // switch: optionId must be non-null & one of the two active options
            if (!dto.optionId) throw new InvalidOperationError("Switch default requires a valid optionId");
            const exists = (a as any).options.find((o: any) => o.id === dto.optionId && !o.isDeleted);
            if (!exists) throw new OptionNotFoundError(dto.optionId);
            (a as any).defaultOptionId = dto.optionId;
        }

        await (cat as any).save();
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
