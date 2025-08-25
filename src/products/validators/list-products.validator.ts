import { query } from "express-validator";

const splitStatuses = (v: unknown): string[] | undefined => {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string")
        return v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    return undefined;
};

export const listProductsValidator = [
    // Optional: admin can filter by tenantId (manager ignores this)
    query("tenantId").optional().isString().trim().notEmpty(),

    // Category filter
    query("categoryId").optional().isMongoId().withMessage("Invalid categoryId"),

    // includeDeleted
    query("includeDeleted").optional().isBoolean().toBoolean(),

    // status (multi via comma or repeated query param)
    query("status")
        .optional()
        .customSanitizer(splitStatuses)
        .custom((vals) => {
            if (!vals) return true;
            const allowed = new Set(["draft", "active", "archived"]);
            for (const s of vals) if (!allowed.has(s)) throw new Error("Invalid status");
            return true;
        }),

    // search
    query("q").optional().isString().trim().isLength({ min: 1 }),

    // pagination
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),

    // sorting
    query("sortBy").optional().isIn(["createdAt", "updatedAt", "name"]),
    query("sortOrder").optional().isIn(["asc", "desc"]),
];
