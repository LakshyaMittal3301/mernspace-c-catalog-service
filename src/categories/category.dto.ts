// src/categories/category.dto.ts
import { AttributeDefinition } from "../core/types/attributes";
import { ModificationPreset } from "../core/types/modifications";
import { CreateAttributeDto } from "./attribute.dto";
import { CreatePresetDto } from "./preset.dto";

export type CreateCategoryDto = {
    name: string;
    attributes?: CreateAttributeDto[];
    modificationPresets?: CreatePresetDto[];
};

export type UpdateCategoryDto = {
    name?: string;
};

export type ListCategoryDto = {
    includeDeleted: boolean;
};

export type GetCategoryDto = {
    includeDeleted: boolean;
};

export type PublicCategoryDto = {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
    modificationPresets: ModificationPreset[];
    isDeleted: boolean;
    deletedAt?: string;
};
