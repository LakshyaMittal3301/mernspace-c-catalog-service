import { Model } from "mongoose";
import { Product } from "./product.types";
import { CreateProductDto, PublicProductDto, UpdateProductDto } from "./product.dto";
import { toPublicProductDto } from "./product.mapper";
import {
    DomainValidationError,
    DuplicateProductNameError,
    ForbiddenTenantUpdateError,
    InvalidImageKeyError,
    ProductArchivedError,
    ProductNotFoundError,
} from "./product.errors";
import { publicUrlForKey } from "../config/storage";
import { Roles } from "../common/constants";

type AuthCtx = { role: string; tenantId?: string };

export interface IProductService {
    create(dto: CreateProductDto): Promise<PublicProductDto>;
    update(id: string, dto: UpdateProductDto, auth: AuthCtx): Promise<UpdateProductDto>;
}

export class ProductService implements IProductService {
    constructor(private productModel: Model<Product>) {}

    async create(dto: CreateProductDto): Promise<PublicProductDto> {
        try {
            const data = {
                tenantId: dto.tenantId!,
                name: dto.name,
                description: dto.description,
                image: dto.image,
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
            throw err;
        }
    }

    async update(id: string, dto: UpdateProductDto, auth: AuthCtx): Promise<UpdateProductDto> {
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

    private async loadForWrite(id: string, auth: AuthCtx) {
        const doc = await this.productModel.findById(id);
        if (!doc) throw new ProductNotFoundError(id);
        if (doc.isDeleted) throw new ProductArchivedError(id);
        if (auth.role === Roles.MANAGER && doc.tenantId !== auth.tenantId) {
            throw new ForbiddenTenantUpdateError();
        }
        return doc;
    }
}
