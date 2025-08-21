import { Schema, model, HydratedDocument } from "mongoose";
import { Category } from "./category.types";

const AttributeOptionSchema = new Schema(
    { id: { type: String, required: true }, label: { type: String, required: true } },
    { _id: false },
);

const AttributeDefBaseSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio", "switch"] },
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
    { id: { type: String, required: true }, label: { type: String, required: true } },
    { _id: false },
);

const ModificationPresetBaseSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio"] },
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

const CategorySchema = new Schema<Category>(
    {
        name: { type: String, required: true },
        attributes: { type: [AttributeDefBaseSchema], default: [] },
        modificationPresets: { type: [ModificationPresetBaseSchema], default: [] },
    },
    { timestamps: true },
);

(CategorySchema.path("attributes") as any).discriminator("switch", SwitchDefSchema);
(CategorySchema.path("attributes") as any).discriminator("radio", RadioDefSchema);
(CategorySchema.path("attributes") as any).discriminator("checkbox", CheckboxDefSchema);

(CategorySchema.path("modificationPresets") as any).discriminator("radio", RadioModificationSchema);
(CategorySchema.path("modificationPresets") as any).discriminator("checkbox", CheckboxModificationSchema);

function uniqueOptionIds(def: any) {
    if (!def?.options) return true;
    const ids = def.options.map((o: any) => o.id);
    return new Set(ids).size === ids.length;
}

CategorySchema.pre("validate", function (next) {
    const doc: any = this;

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
