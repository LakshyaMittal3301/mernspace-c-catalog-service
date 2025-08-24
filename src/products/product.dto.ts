import { AttributeValue } from "../core/types/attributes";
import { ModificationDef } from "../core/types/modifications";
import { ProductStatus } from "./product.types";

export type CreateAttributeValueBase = {
    // Attributes
    defId: string;
    kind: "checkbox" | "radio" | "switch";
};

export type CreateSwitchAttributeValue = CreateAttributeValueBase & {
    kind: "switch";
    selectedOptionId: string;
};

export type CreateRadioAttributeValue = CreateAttributeValueBase & {
    kind: "radio";
    selectedOptionId?: string;
};

export type CreateCheckboxAttributeValue = CreateAttributeValueBase & {
    kind: "checkbox";
    selectedOptionIds: string[];
};

export type CreateAttributeValueDto =
    | CreateSwitchAttributeValue
    | CreateRadioAttributeValue
    | CreateCheckboxAttributeValue;

// Modifications
export type CreateModificationOptionsDto = {
    label: string;
    price: number;
};

export type CreateRadioModificationDto = {
    name: string;
    kind: "radio";
    isBase?: boolean;
    options: CreateModificationOptionsDto[];
    defaultOptionIndex?: number;
};

export type CreateCheckboxModificationDto = {
    name: string;
    kind: "checkbox";
    options: CreateModificationOptionsDto[];
    minSelected?: number;
    maxSelected?: number;
};

export type CreateModificationDto = CreateRadioModificationDto | CreateCheckboxModificationDto;

// Products

export type CreateProductDto = {
    tenantId?: string;
    name: string;
    description: string;
    image?: { key: string; url: string };
    categoryId: string;
    attributeValues?: CreateAttributeValueDto[];
    modifications: CreateModificationDto[];
    status?: ProductStatus;
};

export type UpdateProductDto = {
    name?: string;
    description?: string;
    status?: ProductStatus; // "draft" | "active" | "archived"
    image?: { key: string; url?: string }; // url is ignored; server recomputes
    categoryId?: string; // if provided & different → clear attributeValues
    attributeValues?: CreateAttributeValueDto[]; // replaces full set (if provided)
};

export type PublicProductDto = {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    image?: { key: string; url: string };
    categoryId: string;
    attributeValues: AttributeValue[];
    modifications: ModificationDef[];
    status: ProductStatus;
    isDeleted: boolean;
    deletedAt?: string;
};
