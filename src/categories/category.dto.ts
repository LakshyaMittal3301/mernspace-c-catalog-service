import { AttributeDefinition } from "../core/types/attributes";
import { ModificationPreset } from "../core/types/modifications";

export type CreateCategoryDto = {
    name: string;
    attributes?: AttributeDefinition[];
    modificationPresets?: ModificationPreset[];
};

export type PublicCategoryDto = {
    id: string;
    name: string;
    attributes: AttributeDefinition[];
    modificationPresets: ModificationPreset[];
};
