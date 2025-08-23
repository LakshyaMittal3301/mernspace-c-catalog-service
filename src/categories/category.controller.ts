import { Request, Response } from "express";
import { ICategoryService } from "./category.service";
import { Logger } from "winston";
import {
    CreateCategoryDto,
    GetCategoryDto,
    ListCategoryDto,
    PublicCategoryDto,
    UpdateCategoryDto,
} from "./category.dto";
import {
    AttributeNotFoundError,
    CategoryArchivedError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidOperationError,
    OptionNotFoundError,
} from "./category.errors";
import createHttpError from "http-errors";
import { isAdmin } from "../common/utils";
import { matchedData } from "express-validator";
import {
    AddAttributeOptionsDto,
    CreateAttributeDto,
    SetAttributeDefaultDto,
    UpdateAttributeOptionDto,
} from "./attribute.dto";
import { CreatePresetDto } from "./preset.dto";

export default class CategoryController {
    constructor(
        private logger: Logger,
        private categoryService: ICategoryService,
    ) {}

    create = async (req: Request<{}, { category: PublicCategoryDto }, CreateCategoryDto>, res: Response) => {
        try {
            const createCategoryDto = req.body;
            const category = await this.categoryService.create(createCategoryDto);
            res.status(201).json({ category });
        } catch (err) {
            if (err instanceof DuplicateCategoryNameError) {
                this.logger.error("Duplicate Category Name", { error: err });
                throw createHttpError(409, err.message);
            }
            this.logger.error("Error while creating category", { error: err });
            throw err;
        }
    };

    update = async (
        req: Request<{ id: string }, { category: PublicCategoryDto }, UpdateCategoryDto>,
        res: Response,
    ) => {
        try {
            const category = await this.categoryService.update(req.params.id, req.body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof DuplicateCategoryNameError) throw createHttpError(409, err.message);
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            this.logger.error("Error updating the category", { error: err });
            throw err;
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response) => {
        try {
            const id = req.params.id;
            await this.categoryService.softDelete(id);
            res.sendStatus(204);
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            this.logger.error("Error while deleting the category", { errror: err });
            throw err;
        }
    };

    list = async (req: Request<{}, { categories: PublicCategoryDto[] }, {}>, res: Response) => {
        try {
            const queryData = matchedData(req, { locations: ["query"], onlyValidData: true }) as {
                includeDeleted?: boolean;
            };

            const listCategoryDto: ListCategoryDto = {
                includeDeleted: isAdmin(req) ? (queryData.includeDeleted ?? false) : false,
            };
            const categories = await this.categoryService.list(listCategoryDto);
            res.status(200).json({ categories });
        } catch (err) {
            this.logger.error("Error while fetching categories", { error: err });
            throw err;
        }
    };

    get = async (req: Request<{ id: string }, { category: PublicCategoryDto }, {}>, res: Response) => {
        try {
            const data = matchedData(req, {
                locations: ["params", "query"],
                onlyValidData: true,
                includeOptionals: true,
            }) as {
                id: string;
                includeDeleted?: boolean;
            };

            const getCategoryDto: GetCategoryDto = {
                includeDeleted: isAdmin(req) ? (data.includeDeleted ?? false) : false,
            };

            const category = await this.categoryService.get(req.params.id, getCategoryDto);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) {
                if (isAdmin(req)) throw createHttpError(409, "Category is archived");
                throw createHttpError(404, "Category not found");
            }
            this.logger.error("Error while fetching category");
            throw err;
        }
    };

    addAttribute = async (req: Request, res: Response) => {
        try {
            // 1) Extract the validated param ONLY from params
            const { id } = matchedData(req, {
                locations: ["params"],
                onlyValidData: true,
                includeOptionals: true,
            }) as { id: string };

            // Fallback safety: if still undefined, read from req.params (means validator didn’t match)
            // if (!id) { throw createHttpError(400, "Invalid category id"); }

            // 2) Extract the validated body ONLY from body
            const body = matchedData(req, {
                locations: ["body"],
                onlyValidData: true,
                includeOptionals: true,
            }) as CreateAttributeDto;

            const category = await this.categoryService.addAttribute(id, body);
            res.status(201).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            this.logger.error("Error adding attribute to category", { error: err });
            throw err;
        }
    };

    updateAttribute = async (req: Request, res: Response) => {
        const { id, attrId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
        };
        const body = matchedData(req, { locations: ["body"], onlyValidData: true, includeOptionals: true });

        try {
            const category = await this.categoryService.updateAttribute(id, attrId, body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            if (err instanceof InvalidOperationError) throw createHttpError(400, err.message);
            this.logger.error("Error updating attribute", { err });
            throw err;
        }
    };

    deleteAttribute = async (req: Request, res: Response) => {
        const { id, attrId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
        };

        try {
            await this.categoryService.deleteAttribute(id, attrId);
            res.sendStatus(204);
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            this.logger.error("Error deleting attribute", { err });
            throw err;
        }
    };

    addAttributeOptions = async (req: Request, res: Response) => {
        const { id, attrId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
        };
        const body = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as AddAttributeOptionsDto;

        try {
            const category = await this.categoryService.addAttributeOptions(id, attrId, body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            if (err instanceof InvalidOperationError) throw createHttpError(400, err.message);
            this.logger.error("Error adding attribute options", { err });
            throw err;
        }
    };

    updateAttributeOption = async (req: Request, res: Response) => {
        const { id, attrId, optId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
            optId: string;
        };
        const body = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as UpdateAttributeOptionDto;

        try {
            const category = await this.categoryService.updateAttributeOption(id, attrId, optId, body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            if (err instanceof OptionNotFoundError) throw createHttpError(404, "Option not found");
            if (err instanceof InvalidOperationError) throw createHttpError(400, err.message);
            this.logger.error("Error updating attribute option", { err });
            throw err;
        }
    };

    deleteAttributeOption = async (req: Request, res: Response) => {
        const { id, attrId, optId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
            optId: string;
        };

        try {
            await this.categoryService.deleteAttributeOption(id, attrId, optId);
            res.sendStatus(204);
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            if (err instanceof OptionNotFoundError) throw createHttpError(404, "Option not found");
            if (err instanceof InvalidOperationError) throw createHttpError(400, err.message);
            this.logger.error("Error deleting attribute option", { err });
            throw err;
        }
    };

    setAttributeDefault = async (req: Request, res: Response) => {
        const { id, attrId } = matchedData(req, { locations: ["params"], onlyValidData: true }) as {
            id: string;
            attrId: string;
        };
        const body = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as SetAttributeDefaultDto;

        try {
            const category = await this.categoryService.setAttributeDefault(id, attrId, body);
            res.status(200).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            if (err instanceof AttributeNotFoundError) throw createHttpError(404, "Attribute not found");
            if (err instanceof OptionNotFoundError) throw createHttpError(404, "Option not found");
            if (err instanceof InvalidOperationError) throw createHttpError(400, err.message);
            this.logger.error("Error setting attribute default", { err });
            throw err;
        }
    };

    addPreset = async (req: Request, res: Response) => {
        const { id } = matchedData(req, { locations: ["params"], onlyValidData: true }) as { id: string };
        const body = matchedData(req, {
            locations: ["body"],
            onlyValidData: true,
            includeOptionals: true,
        }) as CreatePresetDto;

        try {
            const category = await this.categoryService.addPreset(id, body);
            res.status(201).json({ category });
        } catch (err) {
            if (err instanceof CategoryNotFoundError) throw createHttpError(404, "Category not found");
            if (err instanceof CategoryArchivedError) throw createHttpError(409, "Category is archived");
            this.logger.error("Error creating modification preset", { err });
            throw err;
        }
    };
}
