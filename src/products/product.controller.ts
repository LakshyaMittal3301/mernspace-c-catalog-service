import { Response } from "express";
import { Request } from "express-jwt";
import { matchedData } from "express-validator";
import createHttpError from "http-errors";
import { Logger } from "winston";
import { IProductService } from "./product.service";
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from "./product.dto";
import {
    DomainValidationError,
    DuplicateProductNameError,
    ForbiddenTenantUpdateError,
    InvalidImageKeyError,
    ProductArchivedError,
    ProductNotFoundError,
} from "./product.errors";
import { isAdmin, isManager } from "../common/utils";
import { Roles } from "../common/constants";

function normalizeListQuery(raw: any, role: string, authTenantId?: string): ListProductsQueryDto {
    // defaults
    const page = Number.isInteger(raw.page) ? raw.page : 1;
    const limitRaw = Number.isInteger(raw.limit) ? raw.limit : 20;
    const limit = Math.max(1, Math.min(100, limitRaw));
    const sortBy = (raw.sortBy as any) ?? "createdAt";
    const sortOrder = (raw.sortOrder as any) ?? "desc";

    // includeDeleted default: false for everyone; manager cannot enable it
    const includeDeleted = role === Roles.MANAGER ? false : !!raw.includeDeleted;

    // status already sanitized to string[] by validator (or undefined)
    const status = Array.isArray(raw.status) ? (raw.status as any[]) : undefined;

    // Tenant scoping
    let tenantId: string | undefined = undefined;
    if (role === Roles.MANAGER) tenantId = authTenantId;
    else if (typeof raw.tenantId === "string" && raw.tenantId.trim()) tenantId = raw.tenantId.trim();

    const dto: ListProductsQueryDto = {
        tenantId,
        categoryId: raw.categoryId,
        includeDeleted,
        status: status as any,
        q: raw.q,
        page,
        limit,
        sortBy,
        sortOrder,
    };
    return dto;
}

export default class ProductController {
    constructor(
        private logger: Logger,
        private productService: IProductService,
    ) {}

    create = async (req: Request, res: Response) => {
        try {
            const body = matchedData(req, {
                locations: ["body"],
                onlyValidData: true,
                includeOptionals: true,
            }) as CreateProductDto;

            const dto: CreateProductDto = { ...body };
            if (isManager(req)) {
                const t = req.auth?.tenantId;
                if (!t) throw createHttpError(403, "Manager token missing tenantId");
                dto.tenantId = t;
            } else if (isAdmin(req)) {
                if (!dto.tenantId) throw createHttpError(400, "tenantId is required for admin");
            } else {
                throw createHttpError(403, "Not enough permissions");
            }

            const product = await this.productService.create(dto);
            res.status(201).json({ product });
        } catch (err: any) {
            if (err instanceof DuplicateProductNameError) throw createHttpError(409, err.message);

            if (err instanceof InvalidImageKeyError) throw createHttpError(400, err.message);

            if (err instanceof DomainValidationError) throw createHttpError(400, err.message);

            if (err?.name === "MongoServerError" && err?.code === 11000)
                throw createHttpError(409, "Product name already exists");

            const msg = String(err?.message ?? "");
            this.logger.error("Error creating product", { err, stack: err?.stack, message: msg });
            throw err;
        }
    };

    update = async (req: Request, res: Response) => {
        // extract only validated fields (params + body)
        const paramsData = matchedData(req, {
            locations: ["params"],
            onlyValidData: true,
            includeOptionals: true,
        }) as { id: string };

        const bodyData = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as UpdateProductDto;

        const auth = { role: req.auth?.role ?? "", tenantId: req.auth?.tenantId };

        try {
            const product = await this.productService.update(paramsData.id, bodyData, auth);
            res.status(200).json({ product });
        } catch (err) {
            if (err instanceof ProductNotFoundError) throw createHttpError(404, "Product not found");
            if (err instanceof ProductArchivedError) {
                // Admin → 409, Manager → 404 (treat as not found)
                if (isAdmin(req)) throw createHttpError(409, "Product is archived");
                throw createHttpError(404, "Product not found");
            }
            if (err instanceof ForbiddenTenantUpdateError) throw createHttpError(403, "Not enough permissions");
            if (err instanceof InvalidImageKeyError) throw createHttpError(400, err.message);
            if (err instanceof DuplicateProductNameError) throw createHttpError(409, err.message);
            if (err instanceof DomainValidationError) throw createHttpError(400, err.message);

            this.logger?.error?.("Error updating product", { err });
            throw err;
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            const { id } = matchedData(req, { locations: ["params"], onlyValidData: true }) as { id: string };
            const auth = { role: req.auth?.role ?? "", tenantId: req.auth?.tenantId };

            await this.productService.softDelete(id, auth);
            res.sendStatus(204);
        } catch (err: any) {
            if (err instanceof ProductNotFoundError) throw createHttpError(404, "Product not found");
            if (err instanceof ForbiddenTenantUpdateError) throw createHttpError(403, "Not enough permissions");

            this.logger?.error?.("Error deleting product", { err });
            throw err;
        }
    };

    list = async (req: Request, res: Response) => {
        const qdata = matchedData(req, { locations: ["query"], onlyValidData: true, includeOptionals: true });
        const auth = { role: req.auth?.role ?? "", tenantId: req.auth?.tenantId };
        const dto = normalizeListQuery(qdata, auth.role, auth.tenantId);

        try {
            const result = await this.productService.list(dto, auth);
            res.status(200).json(result);
        } catch (err: any) {
            // Listing shouldn't raise domain errors; propagate unexpected
            throw err;
        }
    };
}
