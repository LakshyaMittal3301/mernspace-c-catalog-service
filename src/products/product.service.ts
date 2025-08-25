import { Model } from "mongoose";
import { Product } from "./product.types";
import {
    CreateProductDto,
    ListProductsQueryDto,
    ListProductsResponseDto,
    PublicProductDto,
    PublicProductListItemDto,
    UpdateProductDto,
    UpdateProductModificationDto,
} from "./product.dto";
import { toProductListItemDto, toPublicProductDto } from "./product.mapper";
import {
    BaseRadioConflictError,
    CannotDeleteBaseRadioError,
    DomainValidationError,
    DuplicateProductNameError,
    ForbiddenTenantUpdateError,
    InvalidImageKeyError,
    ModificationNotFoundError,
    ProductArchivedError,
    ProductNotFoundError,
} from "./product.errors";
import { publicUrlForKey } from "../config/storage";
import { Roles } from "../common/constants";

type AuthCtx = { role: string; tenantId?: string };

export interface IProductService {
    create(dto: CreateProductDto): Promise<PublicProductDto>;
    update(id: string, dto: UpdateProductDto, auth: AuthCtx): Promise<PublicProductDto>;
    softDelete(id: string, auth: AuthCtx): Promise<void>;
    list(query: ListProductsQueryDto, auth: AuthCtx): Promise<ListProductsResponseDto>;
    get(id: string, includeDeleted: boolean, auth: AuthCtx): Promise<PublicProductDto>;
    addModification(productId: string, dto: any, auth: AuthCtx): Promise<PublicProductDto>;
    updateModification(
        productId: string,
        modId: string,
        dto: UpdateProductModificationDto,
        auth: AuthCtx,
    ): Promise<PublicProductDto>;
    deleteModification(productId: string, modId: string, auth: AuthCtx): Promise<void>;
}

export class ProductService implements IProductService {
    constructor(private productModel: Model<Product>) {}

    async create(dto: CreateProductDto): Promise<PublicProductDto> {
        try {
            let image = dto.image;
            if (dto.image?.key) {
                const expectedPrefix = `products/${dto.tenantId}/`;
                if (!dto.image.key.startsWith(expectedPrefix)) {
                    throw new InvalidImageKeyError();
                }
                image = { key: dto.image.key, url: publicUrlForKey(dto.image.key) };
            }

            const data = {
                tenantId: dto.tenantId!,
                name: dto.name,
                description: dto.description,
                image,
                categoryId: dto.categoryId,
                attributeValues: dto.attributeValues ?? [],
                modifications: dto.modifications ?? [],
                status: dto.status ?? "draft",
                isDeleted: false,
            };

            const created = await this.productModel.create(data);
            return toPublicProductDto(created);
        } catch (err: any) {
            if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
                throw new DuplicateProductNameError(dto.name);
            }
            if (err?.name === "ValidationError" || typeof err?.message === "string") {
                throw new DomainValidationError(err.message);
            }
            throw err;
        }
    }

    async update(id: string, dto: UpdateProductDto, auth: AuthCtx): Promise<PublicProductDto> {
        const doc = await this.loadForWrite(id, auth);

        // name / description / status
        if (dto.name !== undefined) doc.name = dto.name;
        if (dto.description !== undefined) doc.description = dto.description;
        if (dto.status !== undefined) doc.status = dto.status;

        // category change → clear attributeValues (ignore any provided)
        if (dto.categoryId !== undefined && dto.categoryId !== doc.categoryId) {
            doc.categoryId = dto.categoryId;
            doc.attributeValues = []; // explicit clear as agreed
        } else if (dto.attributeValues !== undefined) {
            // replace set (validate via model pre-validate against current category)
            doc.attributeValues = dto.attributeValues as any;
        }

        // image: accept key, recompute URL; validate tenant prefix
        if (dto.image?.key) {
            const expectedPrefix = `products/${doc.tenantId}/`;
            if (!dto.image.key.startsWith(expectedPrefix)) {
                throw new InvalidImageKeyError();
            }
            doc.image = { key: dto.image.key, url: publicUrlForKey(dto.image.key) };
        }

        try {
            await doc.save();
            return toPublicProductDto(doc);
        } catch (err: any) {
            // Mongo duplicate key (name unique per tenant among non-deleted)
            if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
                throw new DuplicateProductNameError(dto.name ?? "");
            }
            if (err?.name === "ValidationError" || typeof err?.message === "string") {
                throw new DomainValidationError(err.message);
            }
            throw err;
        }
    }

    async softDelete(id: string, auth: AuthCtx): Promise<void> {
        const doc = await this.productModel.findById(id);
        if (!doc) throw new ProductNotFoundError(id);

        if (auth.role === Roles.MANAGER) {
            if (!auth.tenantId || auth.tenantId !== doc.tenantId) {
                throw new ForbiddenTenantUpdateError();
            }
        }

        if (doc.isDeleted) return;

        doc.isDeleted = true;
        doc.deletedAt = new Date();
        await doc.save();
    }

    async list(query: ListProductsQueryDto, auth: AuthCtx): Promise<ListProductsResponseDto> {
        const { tenantId, categoryId, includeDeleted, status, q, page, limit, sortBy, sortOrder } = query;

        const filter: any = {};

        // Tenant scoping
        if (auth.role === Roles.MANAGER) {
            if (auth.tenantId) filter.tenantId = auth.tenantId;
        } else if (tenantId) {
            filter.tenantId = tenantId;
        }

        if (!includeDeleted) filter.isDeleted = false;
        if (categoryId) filter.categoryId = categoryId;
        if (Array.isArray(status) && status.length > 0) filter.status = { $in: status };

        // Search (regex for now; consider text index later)
        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ name: rx }, { description: rx }];
        }

        // Sorting
        const sort: Record<string, 1 | -1> = {};
        const dir: 1 | -1 = sortOrder === "asc" ? 1 : -1;
        if (sortBy === "name") {
            sort.name = dir;
        } else if (sortBy === "updatedAt") {
            sort.updatedAt = dir;
        } else {
            sort.createdAt = dir; // default
        }

        // Pagination
        const skip = (page - 1) * limit;

        // Projection: fetch only fields needed for list + base price computation
        const proj = {
            tenantId: 1,
            name: 1,
            description: 1,
            image: 1,
            categoryId: 1,
            status: 1,
            isDeleted: 1,
            deletedAt: 1,
            createdAt: 1,
            updatedAt: 1,
            // minimal modifications shape to compute basePrice (not returned in output)
            "modifications.kind": 1,
            "modifications.isBase": 1,
            "modifications.isDeleted": 1,
            "modifications.defaultOptionId": 1,
            "modifications.options.id": 1,
            "modifications.options.price": 1,
            "modifications.options.isDeleted": 1,
        };

        const [total, docs] = await Promise.all([
            this.productModel.countDocuments(filter),
            this.productModel.find(filter, proj).sort(sort).skip(skip).limit(limit).lean(),
        ]);

        const items: PublicProductListItemDto[] = docs.map(toProductListItemDto);
        const hasNextPage = skip + items.length < total;

        return {
            items,
            pageInfo: { page, limit, total, hasNextPage },
        };
    }

    async get(id: string, includeDeleted: boolean, auth: AuthCtx): Promise<PublicProductDto> {
        const doc = await this.productModel.findById(id).lean();
        if (!doc) throw new ProductNotFoundError(id);

        // RBAC/tenant scoping for manager → pretend not found if mismatched
        if (auth.role === Roles.MANAGER) {
            if (!auth.tenantId || auth.tenantId !== doc.tenantId) {
                throw new ProductNotFoundError(id);
            }
        }

        // Archived behavior
        if (!includeDeleted && doc.isDeleted) {
            if (auth.role === Roles.ADMIN) throw new ProductArchivedError(id);
            throw new ProductNotFoundError(id);
        }

        let shaped = doc;

        // Filter sub-items when includeDeleted=false
        if (!includeDeleted) {
            const mods = Array.isArray(doc.modifications) ? doc.modifications : [];
            shaped = {
                ...doc,
                modifications: mods
                    .filter((m: any) => m?.isDeleted !== true)
                    .map((m: any) => ({
                        ...m,
                        options: Array.isArray(m.options)
                            ? m.options.filter((o: any) => o?.isDeleted !== true)
                            : m.options,
                    })),
            };
        }

        return toPublicProductDto(shaped);
    }
    async addModification(productId: string, dto: any, auth: AuthCtx): Promise<PublicProductDto> {
        const doc = await this.loadForWrite(productId, auth);

        // Guard: checkbox cannot be base
        if (dto.kind === "checkbox" && dto.isBase === true) {
            throw new DomainValidationError("checkbox cannot be base");
        }

        // Map defaultOptionIndex → defaultOptionId for radio
        const modToInsert: any = {
            name: dto.name,
            kind: dto.kind,
            isBase: dto.kind === "radio" ? !!dto.isBase : false,
            options: dto.options ?? [],
            // radio only
            defaultOptionId: undefined as string | undefined,
            // checkbox only
            minSelected: dto.kind === "checkbox" ? dto.minSelected : undefined,
            maxSelected: dto.kind === "checkbox" ? dto.maxSelected : undefined,
        };

        if (dto.kind === "radio" && dto.defaultOptionIndex != null) {
            const idx = dto.defaultOptionIndex;
            const opt = modToInsert.options?.[idx];
            if (!opt) throw new DomainValidationError("defaultOptionIndex out of range");
            modToInsert.defaultOptionId = opt.id; // id will be auto-generated if missing in pre-validate
        }

        // Base conflict detection for clearer 409
        if (modToInsert.kind === "radio" && modToInsert.isBase === true) {
            const already = this.hasAnotherActiveBase(doc);
            if (already) throw new BaseRadioConflictError();
        }

        doc.modifications.push(modToInsert);

        try {
            await doc.save();
            return toPublicProductDto(doc);
        } catch (err: any) {
            if (err?.name === "ValidationError" || typeof err?.message === "string") {
                throw new DomainValidationError(err.message);
            }
            throw err;
        }
    }

    async updateModification(
        productId: string,
        modId: string,
        dto: UpdateProductModificationDto,
        auth: AuthCtx,
    ): Promise<PublicProductDto> {
        const doc = await this.loadForWrite(productId, auth);
        const mod = this.findActiveMod(doc, modId);
        if (!mod) throw new ModificationNotFoundError(modId);

        // apply allowed fields only (validator already forbids others)
        if (dto.name !== undefined) mod.name = dto.name;

        if (mod.kind === "radio") {
            if (dto.isRequired !== undefined) mod.isRequired = dto.isRequired;
            if (dto.minSelected !== undefined || dto.maxSelected !== undefined) {
                throw new DomainValidationError("minSelected/maxSelected apply only to checkbox");
            }
        } else if (mod.kind === "checkbox") {
            if (dto.minSelected !== undefined) mod.minSelected = dto.minSelected;
            if (dto.maxSelected !== undefined) mod.maxSelected = dto.maxSelected;
            if (dto.isRequired !== undefined) {
                throw new DomainValidationError("isRequired applies only to radio");
            }
        }

        try {
            await doc.save();
            return toPublicProductDto(doc);
        } catch (err: any) {
            if (err?.name === "ValidationError" || typeof err?.message === "string") {
                throw new DomainValidationError(err.message);
            }
            throw err;
        }
    }

    async deleteModification(productId: string, modId: string, auth: AuthCtx): Promise<void> {
        const doc = await this.loadForWrite(productId, auth);
        const mod = (doc.modifications ?? []).find((m: any) => m.id === modId);
        if (!mod) throw new ModificationNotFoundError(modId);

        if (mod.isDeleted) return; // idempotent

        if (mod.kind === "radio" && mod.isBase === true) {
            throw new CannotDeleteBaseRadioError();
        }

        mod.isDeleted = true;
        mod.deletedAt = new Date();

        try {
            await doc.save();
        } catch (err: any) {
            if (err?.name === "ValidationError" || typeof err?.message === "string") {
                throw new DomainValidationError(err.message);
            }
            throw err;
        }
    }

    private async loadForWrite(id: string, auth: AuthCtx) {
        const doc = await this.productModel.findById(id);
        if (!doc) throw new ProductNotFoundError(id);
        if (doc.isDeleted) throw new ProductArchivedError(id);
        if (auth.role === Roles.MANAGER && doc.tenantId !== auth.tenantId) {
            throw new ForbiddenTenantUpdateError();
        }
        return doc;
    }

    private findActiveMod(doc: any, modId: string) {
        return (doc.modifications ?? []).find((m: any) => m.id === modId && m.isDeleted !== true);
    }

    private hasAnotherActiveBase(doc: any) {
        return (doc.modifications ?? []).some(
            (m: any) => m.kind === "radio" && m.isBase === true && m.isDeleted !== true,
        );
    }
}
