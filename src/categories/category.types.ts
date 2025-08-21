import { AttributeDefinition } from "../core/types/attributes";
import { ModificationPreset } from "../core/types/modifications";

export interface Category {
    name: string;
    attributes: AttributeDefinition[];
    modificationPresets: ModificationPreset[];
}
