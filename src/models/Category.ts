import { InferSchemaType, model, Schema } from "mongoose";

const OptionSchema = new Schema(
    {
        id: { type: String, required: true },
        label: { type: String, required: true },
    },
    {
        _id: false,
    },
);

const AttributeDefBaseSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio", "switch"] },
        required: { type: Boolean, default: false },
        isDeleted: { type: Boolean, defaut: false },
        deletedAt: { type: Date },
    },
    {
        _id: false,
        discriminatorKey: "kind",
    },
);

const SwitchDefSchema = new Schema(
    {
        options: {
            type: [OptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length == 2,
                message: "Switch Attribute must have exactly two 2 options",
            },
        },
        defaultOptionId: { type: String },
    },
    {
        _id: false,
    },
);

const RadioDefSchema = new Schema(
    {
        options: {
            type: [OptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Radio Attribute must have atleast 1 option",
            },
        },
        defaultOptionId: { type: String },
    },
    {
        _id: false,
    },
);

const CheckboxDefSchema = new Schema(
    {
        options: {
            type: [OptionSchema],
            validate: {
                validator: (v: unknown) => Array.isArray(v) && v.length >= 1,
                message: "Radio Attribute must have at least 1 option",
            },
        },
        defaultOptionId: { type: String },
        minSelected: { type: Number, default: 0 },
        maxSelected: { type: Number },
    },
    {
        _id: false,
    },
);

const CategorySchema = new Schema(
    {
        name: { type: String, required: true },
        attributes: { type: [AttributeDefBaseSchema], default: [] },
    },
    {
        timestamps: true,
    },
);

(CategorySchema.path("attributes") as any).discriminator("switch", SwitchDefSchema);
(CategorySchema.path("attributes") as any).discriminator("radio", RadioDefSchema);
(CategorySchema.path("attributes") as any).discriminator("checkbox", CheckboxDefSchema);

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
    next();
});

export type CategoryDoc = InferSchemaType<typeof CategorySchema>;
export const CategoryModel = model("Category", CategorySchema);
