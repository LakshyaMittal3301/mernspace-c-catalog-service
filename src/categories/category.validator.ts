import { checkSchema, CustomValidator } from "express-validator";

/** Only check uniqueness if client actually supplies ids (they're optional now) */
const validateOptionsUniqueIfIdsPresent = (opts: any[]) => {
    if (!Array.isArray(opts)) return false;
    const ids = opts.map((o: any) => o?.id).filter((x: any) => typeof x === "string" && x.trim());
    if (ids.length === 0) return true;
    return new Set(ids).size === ids.length;
};

const validateAttributeItem: CustomValidator = (attribute) => {
    if (!attribute || !["radio", "checkbox", "switch"].includes(attribute.kind)) return false;
    if (!attribute.name || typeof attribute.name !== "string" || !attribute.name.trim()) return false;
    if (!Array.isArray(attribute.options) || attribute.options.length < 1) return false;

    // Options: id is OPTIONAL (server generates). We only require a non-empty label.
    if (
        !attribute.options.every(
            (o: any) =>
                o &&
                typeof o.label === "string" &&
                o.label.trim() &&
                // optional fields:
                (o.id === undefined || (typeof o.id === "string" && o.id.trim())) &&
                (o.isDeleted === undefined || typeof o.isDeleted === "boolean") &&
                (o.deletedAt === undefined || typeof o.deletedAt === "string" || o.deletedAt instanceof Date),
        )
    )
        return false;

    if (!validateOptionsUniqueIfIdsPresent(attribute.options)) return false;

    if (attribute.kind === "switch") {
        if (attribute.options.length !== 2) return false;
        if (attribute.defaultOptionId !== undefined && typeof attribute.defaultOptionId !== "string") return false;
    }

    if (attribute.kind === "radio") {
        if (attribute.defaultOptionId !== undefined && typeof attribute.defaultOptionId !== "string") return false;
        if (attribute.isRequired !== undefined && typeof attribute.isRequired !== "boolean") return false;
    }

    // Checkbox constraints
    if (attribute.kind === "checkbox") {
        const minSelected = attribute.minSelected ?? 0;
        const maxSelected = attribute.maxSelected ?? attribute.options.length;
        if (typeof minSelected !== "number" || typeof maxSelected !== "number") return false;
        if (minSelected < 0) return false;
        if (minSelected > attribute.options.length) return false;
        if (maxSelected < 0) return false;
        if (maxSelected > attribute.options.length) return false;
        if (maxSelected < minSelected) return false;
    }

    return true;
};

const validatePresetItem: CustomValidator = (m) => {
    if (!m || !["radio", "checkbox"].includes(m.kind)) return false;
    if (!m.name || typeof m.name !== "string" || !m.name.trim()) return false;
    if (!Array.isArray(m.options) || m.options.length < 1) return false;

    // Options for presets: id OPTIONAL; label required; soft-delete fields allowed
    if (
        !m.options.every(
            (o: any) =>
                o &&
                typeof o.label === "string" &&
                o.label.trim() &&
                (o.id === undefined || (typeof o.id === "string" && o.id.trim())) &&
                (o.isDeleted === undefined || typeof o.isDeleted === "boolean") &&
                (o.deletedAt === undefined || typeof o.deletedAt === "string" || o.deletedAt instanceof Date),
        )
    )
        return false;

    if (!validateOptionsUniqueIfIdsPresent(m.options)) return false;

    if (m.kind === "radio") {
        if (m.defaultOptionId !== undefined && typeof m.defaultOptionId !== "string") return false;
        if (m.isRequired !== undefined && typeof m.isRequired !== "boolean") return false;
    } else {
        const min = m.minSelected ?? 0;
        const max = m.maxSelected ?? m.options.length;
        if (typeof min !== "number" || typeof max !== "number") return false;
        if (min < 0) return false;
        if (max < min) return false;
        if (max > m.options.length) return false;
    }

    return true;
};

export const createCategoryValidator = checkSchema(
    {
        name: {
            isString: true,
            trim: true,
            notEmpty: { errorMessage: "Category name is required" },
        },
        attributes: {
            optional: true,
            isArray: { errorMessage: "Attributes must be an array" },
        },
        modificationPresets: {
            optional: true,
            isArray: { errorMessage: "Modification Presets must be an array" },
        },
        "attributes.*": {
            custom: {
                options: validateAttributeItem,
                errorMessage: "Invalid attribute item",
            },
        },
        "modificationPresets.*": {
            custom: {
                options: validatePresetItem,
                errorMessage: "Invalid modification preset",
            },
        },
    },
    ["body"],
);
