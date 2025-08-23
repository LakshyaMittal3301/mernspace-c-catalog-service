import { PublicProductDto } from "./product.dto";
import { ProductDoc } from "./product.model";

export const toPublicProductDto = (doc: ProductDoc): PublicProductDto => ({
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    name: doc.name,
    description: doc.description,
    image: doc.image ?? undefined,
    categoryId: doc.categoryId,
    attributeValues: doc.attributeValues ?? [],
    modifications: doc.modifications ?? [],
    status: doc.status,
    isDeleted: doc.isDeleted,
    deletedAt: doc.deletedAt?.toISOString(),
});
