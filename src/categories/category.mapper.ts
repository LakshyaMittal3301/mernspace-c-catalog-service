import { PublicCategoryDto, PublicCategoryListItemDto } from "./category.dto";
import { CategoryDoc } from "./category.model";

const toISO = (d: any | undefined) => (d ? new Date(d).toISOString() : undefined);

export const toPublicCategoryDto = (c: CategoryDoc | any): PublicCategoryDto => ({
    id: String(c._id),
    name: c.name,
    attributes: c.attributes ?? [],
    modificationPresets: c.modificationPresets ?? [],
    isDeleted: !!c.isDeleted,
    deletedAt: toISO(c.deletedAt),
    createdAt: toISO(c.createdAt)!, // Category schema has timestamps: true
    updatedAt: toISO(c.updatedAt)!,
});

export const toCategoryListItemDto = (c: any): PublicCategoryListItemDto => ({
    id: String(c._id),
    name: c.name,
    isDeleted: !!c.isDeleted,
    deletedAt: toISO(c.deletedAt),
    createdAt: toISO(c.createdAt)!,
    updatedAt: toISO(c.updatedAt)!,
});
