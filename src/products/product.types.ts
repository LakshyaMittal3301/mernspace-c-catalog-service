import { AttributeValue } from "../core/types/attributes";
import { ModificationDef } from "../core/types/modifications";

export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
    tenantId: string;
    name: string;
    description: string;
    image?: { key: string; url: string };
    categoryId: string;
    attributeValues: AttributeValue[];
    modifications: ModificationDef[];
    status: ProductStatus;
    isDeleted: boolean;
    deletedAt?: Date;
}
