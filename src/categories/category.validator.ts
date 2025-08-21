import { checkSchema, CustomValidator } from "express-validator";

const isNonEmptyString = (v: any) => typeof v === "string" && v.trim().length > 0;

const validateAttributeItem: CustomValidator = (a) => {
    if (!a || !["radio", "checkbox", "switch"].includes(a.kind)) return false;
    if (!isNonEmptyString(a.name)) return false;
    if (!Array.isArray(a.options) || a.options.length < 1) return false;
    if (!a.options.every((o: any) => o && isNonEmptyString(o.label))) return false;

    if (a.kind === "switch") {
        if (a.options.length !== 2) return false;
        if (typeof a.defaultOptionIndex !== "number") return false;
        if (a.defaultOptionIndex < 0 || a.defaultOptionIndex > 1) return false;
    }

    if (a.kind === "radio") {
        if (
            a.defaultOptionIndex !== undefined &&
            (typeof a.defaultOptionIndex !== "number" ||
                a.defaultOptionIndex < 0 ||
                a.defaultOptionIndex >= a.options.length)
        )
            return false;
        if (a.isRequired !== undefined && typeof a.isRequired !== "boolean") return false;
    }

    if (a.kind === "checkbox") {
        const min = a.minSelected ?? 0;
        const max = a.maxSelected ?? a.options.length;
        if (typeof min !== "number" || typeof max !== "number") return false;
        if (min < 0) return false;
        if (max < min) return false;
        if (max > a.options.length) return false;
    }

    return true;
};

const validatePresetItem: CustomValidator = (m) => {
    if (!m || !["radio", "checkbox"].includes(m.kind)) return false;
    if (!isNonEmptyString(m.name)) return false;
    if (!Array.isArray(m.options) || m.options.length < 1) return false;
    if (!m.options.every((o: any) => o && isNonEmptyString(o.label))) return false;

    if (m.kind === "radio") {
        if (
            m.defaultOptionIndex !== undefined &&
            (typeof m.defaultOptionIndex !== "number" ||
                m.defaultOptionIndex < 0 ||
                m.defaultOptionIndex >= m.options.length)
        )
            return false;
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
