import { PublicCategoryDto } from "./category.dto";
import { CategoryDoc } from "./category.model";

export const toPublicCategoryDto = (c: CategoryDoc): PublicCategoryDto => ({
    id: c._id.toString(),
    name: c.name,
    attributes: c.attributes ?? [],
    modificationPresets: c.modificationPresets ?? [],
    isDeleted: c.isDeleted,
    deletedAt: c.deletedAt?.toISOString(),
});
