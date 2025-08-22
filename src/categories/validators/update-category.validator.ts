import { RequestHandler } from "express";
import { body, checkSchema } from "express-validator";

export const updateCategoryValidator = [
    body().custom((value) => {
        if (!value || Object.keys(value).length === 0) {
            throw new Error("Request body cannot be empty");
        }
        return true;
    }),
    checkSchema(
        {
            id: {
                in: ["params"],
                isMongoId: { errorMessage: "Invalid Category Id" },
            },
            name: {
                in: ["body"],
                optional: true,
                isString: { errorMessage: "Name must be a string" },
                trim: true,
                notEmpty: { errorMessage: "Category name is required" },
            },
            isDeleted: {
                in: ["body"],
                custom: {
                    options: (value) => {
                        if (value !== undefined) throw new Error("isDeleted cannot be set");
                        return true; // OK if not provided
                    },
                },
            },
            deletedAt: {
                in: ["body"],
                custom: {
                    options: (value) => {
                        if (value !== undefined) throw new Error("deletedAt cannot be set");
                        return true;
                    },
                },
            },
        },
        ["params", "body"],
    ),
];
