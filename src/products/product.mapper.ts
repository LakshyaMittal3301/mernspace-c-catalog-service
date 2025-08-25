import { PublicProductDto, PublicProductListItemDto } from "./product.dto";
import { ProductDoc } from "./product.model";

export const toPublicProductDto = (doc: any): PublicProductDto => {
    const toISO = (d: any | undefined) => (d ? new Date(d).toISOString() : undefined);

    return {
        id: String(doc._id),
        tenantId: doc.tenantId,
        name: doc.name,
        description: doc.description,
        image: doc.image ? { key: doc.image.key, url: doc.image.url } : undefined,
        categoryId: doc.categoryId,
        attributeValues: doc.attributeValues ?? [],
        modifications: doc.modifications ?? [],
        status: doc.status,
        isDeleted: !!doc.isDeleted,
        deletedAt: toISO(doc.deletedAt),
        createdAt: toISO(doc.createdAt)!, // Product schema has timestamps
        updatedAt: toISO(doc.updatedAt)!,
    };
};

export const toProductListItemDto = (doc: any): PublicProductListItemDto => {
    let basePrice = 0;
    const mods = Array.isArray(doc.modifications) ? doc.modifications : [];
    const base = mods.find((m: any) => m?.kind === "radio" && m?.isBase === true && m?.isDeleted !== true);
    if (base && base.defaultOptionId && Array.isArray(base.options)) {
        const opt = base.options.find((o: any) => o?.id === base.defaultOptionId && o?.isDeleted !== true);
        if (opt?.price != null) basePrice = Number(opt.price) || 0;
    }

    const deleted = !!doc.isDeleted;

    return {
        id: String(doc._id),
        tenantId: doc.tenantId,
        name: doc.name,
        description: doc.description,
        image: doc.image ? { key: doc.image.key, url: doc.image.url } : undefined,
        categoryId: doc.categoryId,
        status: doc.status,
        isDeleted: deleted,
        deletedAt: deleted && doc.deletedAt ? new Date(doc.deletedAt).toISOString() : undefined,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
        basePrice,
    };
};
