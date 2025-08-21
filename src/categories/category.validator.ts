import { checkSchema, CustomValidator } from "express-validator";

const validateOptionsUnique = (opts: any) => {
    if (!Array.isArray(opts)) return false;
    return new Set(opts.map((o: any) => o.id)).size === opts.length;
};

const validateAttributeItem: CustomValidator = (attribute) => {
    if (!attribute || !["radio", "checkbox", "switch"].includes(attribute.kind)) return false;

    if (!attribute.name || typeof attribute.name !== "string" || !attribute.name.trim()) return false;
    if (!Array.isArray(attribute.options) || attribute.options.length < 1) return false;

    if (attribute.kind === "switch") {
        if (attribute.options.length !== 2) return false;
        const ids = new Set(attribute.options);
        if (!attribute.defaultOptionId || !ids.has(attribute.defaultOptionId)) return false;
    }

    if (attribute.kind === "radio") {
        const ids = new Set(attribute.options.map((o: any) => o.id));
        if (attribute.defaultOptionId && !ids.has(attribute.defaultOptionId)) return false;
    }

    if (attribute.kind === "checkbox") {
        const minSelected = attribute.minSelected ?? 0;
        const maxSelected = attribute.maxSelected ?? attribute.options.length;

        if (
            minSelected < 0 ||
            minSelected > attribute.options.length ||
            maxSelected < 0 ||
            maxSelected > attribute.options.length ||
            maxSelected > minSelected
        )
            return false;
    }

    if (!validateOptionsUnique(attribute.options)) return false;
    if (!attribute.options.every((o: any) => o && typeof o.label === "string" && o.label.trim())) return false;
};

const validatePresetItem: CustomValidator = (m) => {
    if (!m || !["radio", "checkbox"].includes(m.kind)) return false;
    if (!m.name || typeof m.name !== "string" || !m.name.trim()) return false;
    if (!Array.isArray(m.options) || m.options.length < 1) return false;

    const ids = new Set(m.options.map((o: any) => o.id));
    if (!validateOptionsUnique(m.options)) return false;

    if (m.kind === "radio") {
        if (m.defaultOptionId && !ids.has(m.defaultOptionId)) return false;
    } else {
        const min = m.minSelected ?? 0;
        const max = m.maxSelected ?? m.options.length;
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
            notEmpty: {
                errorMessage: "Category name is required",
            },
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
                errorMessage: "Invalud attribute item",
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
