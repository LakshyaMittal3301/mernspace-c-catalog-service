import { Model } from "mongoose";
import { Product } from "./product.types";
import { CreateProductDto, PublicProductDto } from "./product.dto";
import { toPublicProductDto } from "./product.mapper";
import { DuplicateProductNameError } from "./product.errors";

export interface IProductService {
    create(dto: CreateProductDto): Promise<PublicProductDto>;
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
}
