import { Schema, model, HydratedDocument } from "mongoose";
import { randomBytes } from "crypto";

import { Category } from "./category.types";

const genId = () => randomBytes(8).toString("base64url");

const AttributeOptionSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        label: { type: String, required: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false },
);

const AttributeDefBaseSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        name: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio", "switch"], immutable: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false, discriminatorKey: "kind" },
);

const SwitchDefSchema = new Schema(
    {
        options: {
            type: [AttributeOptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length === 2,
                message: "Switch Attribute must have exactly 2 options",
            },
        },
        defaultOptionId: { type: String, required: true },
        defaultOptionIndex: { type: Number, select: false },
    },
    { _id: false },
);

const RadioDefSchema = new Schema(
    {
        options: {
            type: [AttributeOptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Radio Attribute must have at least 1 option",
            },
        },
        defaultOptionId: { type: String },
        isRequired: { type: Boolean, default: false },
        defaultOptionIndex: { type: Number, select: false },
    },
    { _id: false },
);

const CheckboxDefSchema = new Schema(
    {
        options: {
            type: [AttributeOptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Checkbox Attribute must have at least 1 option",
            },
        },
        minSelected: { type: Number, default: 0 },
        maxSelected: { type: Number },
    },
    { _id: false },
);

const PresetOptionSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        label: { type: String, required: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false },
);

const ModificationPresetBaseSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        name: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio"], immutable: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false, discriminatorKey: "kind" },
);

const RadioModificationSchema = new Schema(
    {
        options: {
            type: [PresetOptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Radio Modification must have at least 1 option",
            },
        },
        defaultOptionId: { type: String },
        isRequired: { type: Boolean, default: false },
        defaultOptionIndex: { type: Number, select: false },
    },
    { _id: false },
);

const CheckboxModificationSchema = new Schema(
    {
        options: {
            type: [PresetOptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Checkbox Modification must have at least 1 option",
            },
        },
        minSelected: { type: Number, default: 0 },
        maxSelected: { type: Number },
    },
    { _id: false },
);

/* ---------- Category ---------- */
const CategorySchema = new Schema<Category>(
    {
        name: { type: String, required: true },
        attributes: { type: [AttributeDefBaseSchema], default: [] },
        modificationPresets: { type: [ModificationPresetBaseSchema], default: [] },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { timestamps: true },
);

CategorySchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

/* Array discriminators */
(CategorySchema.path("attributes") as any).discriminator("switch", SwitchDefSchema);
(CategorySchema.path("attributes") as any).discriminator("radio", RadioDefSchema);
(CategorySchema.path("attributes") as any).discriminator("checkbox", CheckboxDefSchema);

(CategorySchema.path("modificationPresets") as any).discriminator("radio", RadioModificationSchema);
(CategorySchema.path("modificationPresets") as any).discriminator("checkbox", CheckboxModificationSchema);

/* ---------- Helpers ---------- */
const ensureIds = (obj: any) => {
    if (!obj) return;
    if (!obj.id) obj.id = genId();
    if (Array.isArray(obj.options)) {
        for (const o of obj.options) if (!o.id) o.id = genId();
    }
};

const uniqueIds = (items: any[] = []) => new Set(items.map((x) => x.id)).size === items.length;

const uniqueOptionIds = (def: any) => {
    if (!def?.options) return true;
    const ids = def.options.map((o: any) => o.id);
    return new Set(ids).size === ids.length;
};

/* ---------- Pre-validate: assign ids, enforce uniqueness, validate ---------- */
CategorySchema.pre("validate", function (next) {
    const doc: any = this;

    const attributes = doc.attributes ?? [];
    const presets = doc.modificationPresets ?? [];

    // 1) Ensure IDs exist (in case client omitted them)
    for (const d of attributes) ensureIds(d);
    for (const p of presets) ensureIds(p);

    // 2) Uniqueness of def/preset ids within the category
    if (!uniqueIds(attributes)) return next(new Error("Duplicate attribute definition ids"));
    if (!uniqueIds(presets)) return next(new Error("Duplicate modification preset ids"));

    // Helper: resolve defaultOptionIndex → defaultOptionId, then strip index
    const resolveDefaultFromIndex = (container: any, kind: "switch" | "radio") => {
        if (!Array.isArray(container.options)) return;

        if (typeof container.defaultOptionIndex === "number") {
            const idx = container.defaultOptionIndex;
            const opt = container.options[idx];

            if (!opt) {
                // Give a precise error if index is out of range
                const label = container.name ?? "(unnamed)";
                return next(new Error(`defaultOptionIndex out of range for '${label}'`));
            }

            container.defaultOptionId = opt.id;
        }

        // Do not persist the index field
        container.defaultOptionIndex = undefined;
    };

    // 3) Per-attribute validation
    for (const d of attributes) {
        // Map index → id for switch/radio
        if (d.kind === "switch") resolveDefaultFromIndex(d, "switch");
        if (d.kind === "radio") resolveDefaultFromIndex(d, "radio");

        // Option ID uniqueness within the attribute
        if (!uniqueOptionIds(d)) return next(new Error(`Duplicate option ids in attribute '${d.name}'`));

        // Checkbox constraints
        if (d.kind === "checkbox" && d.maxSelected != null) {
            const max = d.maxSelected as number;
            const min = d.minSelected ?? 0;
            if (max < min) return next(new Error(`maxSelected < minSelected for '${d.name}'`));
            if (d.options && max > d.options.length) {
                return next(new Error(`maxSelected > options.length for '${d.name}'`));
            }
        }

        // defaultOptionId must be present in options when provided
        if (d.defaultOptionId) {
            const ok = d.options?.some((o: any) => o.id === d.defaultOptionId);
            if (!ok) return next(new Error(`defaultOptionId not in options for '${d.name}'`));
        }
    }

    // 4) Per-preset validation
    for (const m of presets) {
        // Map index → id for radio presets
        if (m.kind === "radio") resolveDefaultFromIndex(m, "radio");

        // Option ID uniqueness within the preset
        if (!uniqueOptionIds(m)) return next(new Error(`Duplicate option ids in modification '${m.name}'`));

        // Checkbox constraints
        if (m.kind === "checkbox" && m.maxSelected != null) {
            const max = m.maxSelected as number;
            const min = m.minSelected ?? 0;
            if (max < min) return next(new Error(`maxSelected < minSelected for '${m.name}'`));
            if (m.options && max > m.options.length) {
                return next(new Error(`maxSelected > options.length for '${m.name}'`));
            }
        }

        // defaultOptionId must be present in options when provided
        if (m.defaultOptionId) {
            const ok = m.options?.some((o: any) => o.id === m.defaultOptionId);
            if (!ok) return next(new Error(`defaultOptionId not in options for '${m.name}'`));
        }
    }

    next();
});

export type CategoryDoc = HydratedDocument<Category>;
export const CategoryModel = model<Category>("Category", CategorySchema);
