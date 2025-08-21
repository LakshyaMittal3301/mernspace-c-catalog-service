import { Schema, model, HydratedDocument } from "mongoose";
import { nanoid } from "nanoid";
import { Category } from "./category.types";

const genId = () => nanoid(10);

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
        name: { type: String, required: true, unique: true },
        attributes: { type: [AttributeDefBaseSchema], default: [] },
        modificationPresets: { type: [ModificationPresetBaseSchema], default: [] },
    },
    { timestamps: true },
);

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

    // 1) Ensure IDs exist (in case client omitted them)
    for (const d of doc.attributes ?? []) ensureIds(d);
    for (const p of doc.modificationPresets ?? []) ensureIds(p);

    // 2) Uniqueness of def/preset ids within the category
    if (!uniqueIds(doc.attributes)) return next(new Error("Duplicate attribute definition ids"));
    if (!uniqueIds(doc.modificationPresets)) return next(new Error("Duplicate modification preset ids"));

    // 3) Per-item validation (incl. option id uniqueness)
    for (const d of doc.attributes ?? []) {
        if (!uniqueOptionIds(d)) return next(new Error(`Duplicate option ids in attribute '${d.name}'`));
        if (d.kind === "checkbox" && d.maxSelected != null) {
            const max = d.maxSelected as number;
            const min = d.minSelected ?? 0;
            if (max < min) return next(new Error(`maxSelected < minSelected for '${d.name}'`));
            if (d.options && max > d.options.length)
                return next(new Error(`maxSelected > options.length for '${d.name}'`));
        }
        if (d.defaultOptionId) {
            const ok = d.options?.some((o: any) => o.id === d.defaultOptionId);
            if (!ok) return next(new Error(`defaultOptionId not in options for '${d.name}'`));
        }
    }

    for (const d of doc.modificationPresets ?? []) {
        if (!uniqueOptionIds(d)) return next(new Error(`Duplicate option ids in modification '${d.name}'`));
        if (d.kind === "checkbox" && d.maxSelected != null) {
            const max = d.maxSelected as number;
            const min = d.minSelected ?? 0;
            if (max < min) return next(new Error(`maxSelected < minSelected for '${d.name}'`));
            if (d.options && max > d.options.length)
                return next(new Error(`maxSelected > options.length for '${d.name}'`));
        }
        if (d.defaultOptionId) {
            const ok = d.options?.some((o: any) => o.id === d.defaultOptionId);
            if (!ok) return next(new Error(`defaultOptionId not in options for '${d.name}'`));
        }
    }

    next();
});

export type CategoryDoc = HydratedDocument<Category>;
export const CategoryModel = model<Category>("Category", CategorySchema);
