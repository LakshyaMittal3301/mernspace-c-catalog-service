import { Response } from "express";
import { Request } from "express-jwt";
import { matchedData } from "express-validator";
import createHttpError from "http-errors";
import { Logger } from "winston";
import { IProductService } from "./product.service";
import { CreateProductDto } from "./product.dto";
import { DuplicateProductNameError } from "./product.errors";
import { isAdmin, isManager } from "../common/utils";

const isDomainValidationMessage = (msg: string) => {
    return (
        /Exactly one base radio/i.test(msg) ||
        /Base radio .* (requires defaultOptionId|must have at least one active option)/i.test(msg) ||
        /defaultOptionIndex out of range/i.test(msg) ||
        /checkbox .* cannot be base/i.test(msg) ||
        /minSelected|maxSelected/i.test(msg) ||
        /Category .* not found/i.test(msg) ||
        /Attribute def .* not found/i.test(msg) ||
        /Attribute kind mismatch/i.test(msg) ||
        /selectedOptionId not in active options/i.test(msg) ||
        /is required but no selection provided/i.test(msg) ||
        /selections must be between/i.test(msg) ||
        /Duplicate modification ids/i.test(msg) ||
        /Duplicate option ids/i.test(msg)
    );
};

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
            if (err instanceof DuplicateProductNameError) {
                throw createHttpError(409, err.message);
            }

            if (err?.name === "MongoServerError" && err?.code === 11000) {
                throw createHttpError(409, "Product name already exists");
            }

            if (err?.name === "ValidationError") {
                throw createHttpError(400, err.message);
            }

            const msg = String(err?.message ?? "");
            if (isDomainValidationMessage(msg)) {
                throw createHttpError(400, msg);
            }

            this.logger.error("Error creating product", { err, stack: err?.stack, message: msg });
            throw err;
        }
    };
}
