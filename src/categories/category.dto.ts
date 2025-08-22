// src/categories/category.dto.ts
import { AttributeDefinition } from "../core/types/attributes";
import { ModificationPreset } from "../core/types/modifications";

/** Create payload uses indexes instead of ids for defaults */
type CreateBaseAttribute = {
    name: string;
    kind: "radio" | "checkbox" | "switch";
    options: { label: string; isDeleted?: boolean; deletedAt?: Date }[];
};

type CreateSwitchAttribute = CreateBaseAttribute & {
    kind: "switch";
    defaultOptionIndex: number; // required for switch
};

type CreateRadioAttribute = CreateBaseAttribute & {
    kind: "radio";
    defaultOptionIndex?: number; // optional for radio
    isRequired?: boolean;
};

type CreateCheckboxAttribute = CreateBaseAttribute & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type CreateAttributeInput = CreateSwitchAttribute | CreateRadioAttribute | CreateCheckboxAttribute;

/** Presets: radio can have defaultOptionIndex too */
type CreateBasePreset = {
    name: string;
    kind: "radio" | "checkbox";
    options: { label: string; isDeleted?: boolean; deletedAt?: Date }[];
};

type CreateRadioPreset = CreateBasePreset & {
    kind: "radio";
    defaultOptionIndex?: number;
    isRequired?: boolean;
};

type CreateCheckboxPreset = CreateBasePreset & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type CreateModificationPresetInput = CreateRadioPreset | CreateCheckboxPreset;

export type CreateCategoryDto = {
    name: string;
    attributes?: CreateAttributeInput[];
    modificationPresets?: CreateModificationPresetInput[];
};

export type UpdateCategoryDto = {
    name?: string;
};

export type PublicCategoryDto = {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
    modificationPresets: ModificationPreset[];
};
