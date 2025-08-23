import { Schema, model, HydratedDocument } from "mongoose";
import { randomBytes } from "crypto";
import { CategoryModel } from "../categories/category.model";
import type { Product } from "./product.types";

const genId = () => randomBytes(8).toString("base64url");

/* ---------- Attribute Values (array discriminators) ---------- */
const AttrBaseSchema = new Schema(
    {
        defId: { type: String, required: true },
        kind: { type: String, required: true, enum: ["checkbox", "radio", "switch"], immutable: true },
    },
    { _id: false, strict: true, discriminatorKey: "kind" },
);

const SwitchValSchema = new Schema(
    { selectedOptionId: { type: String, required: true } },
    { _id: false, strict: true },
);
const RadioValSchema = new Schema(
    { selectedOptionId: { type: String, required: false } },
    { _id: false, strict: true },
);
const CheckboxValSchema = new Schema(
    { selectedOptionIds: { type: [String], default: [] } },
    { _id: false, strict: true },
);

/* ---------- Modifications (embedded defs; radio/checkbox) ---------- */
const ModOptionSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        label: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 }, // integer paise
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false },
);

const ModificationBaseSchema = new Schema(
    {
        id: { type: String, required: true, default: genId, immutable: true },
        name: { type: String, required: true, trim: true },
        kind: { type: String, required: true, enum: ["radio", "checkbox"], immutable: true },
        // only valid on radio; tells this group holds absolute base prices
        isBase: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { _id: false, discriminatorKey: "kind" },
);

const RadioModificationSchema = new Schema(
    {
        options: { type: [ModOptionSchema], default: [] },
        defaultOptionId: { type: String }, // required when isBase=true; optional otherwise
    },
    { _id: false, strict: true },
);

const CheckboxModificationSchema = new Schema(
    {
        options: { type: [ModOptionSchema], default: [] },
        minSelected: { type: Number, min: 0 },
        maxSelected: { type: Number, min: 0 },
    },
    { _id: false, strict: true },
);

/* ---------- Product ---------- */
const ProductSchema = new Schema<Product>(
    {
        tenantId: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, required: true },
        image: {
            key: { type: String },
            url: { type: String },
        },
        categoryId: { type: String, required: true, index: true },

        // NOTE: We don’t store a scalar basePrice anymore; base is the radio group with isBase=true
        attributeValues: { type: [AttrBaseSchema], default: [] },
        modifications: { type: [ModificationBaseSchema], default: [] },

        status: { type: String, enum: ["draft", "active", "archived"], default: "active" },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
    },
    { timestamps: true, strict: true },
);

// Unique product name per tenant among active
ProductSchema.index({ tenantId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

/* ---------- Attach array discriminators ---------- */
(ProductSchema.path("attributeValues") as any).discriminator("switch", SwitchValSchema);
(ProductSchema.path("attributeValues") as any).discriminator("radio", RadioValSchema);
(ProductSchema.path("attributeValues") as any).discriminator("checkbox", CheckboxValSchema);

(ProductSchema.path("modifications") as any).discriminator("radio", RadioModificationSchema);
(ProductSchema.path("modifications") as any).discriminator("checkbox", CheckboxModificationSchema);

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

const activeOptions = (def: any) => (def?.options ?? []).filter((o: any) => !o.isDeleted);

/* ---------- Pre-validate: assign ids, enforce uniqueness, validate ---------- */
ProductSchema.pre("validate", async function (next) {
    try {
        const doc: any = this;

        const mods = doc.modifications ?? [];
        const attrVals = doc.attributeValues ?? [];

        // 1) Ensure IDs exist
        for (const m of mods) ensureIds(m);

        // 2) Uniqueness of modification ids and option ids
        if (!uniqueIds(mods)) return next(new Error("Duplicate modification ids"));
        for (const m of mods) {
            if (!uniqueOptionIds(m)) return next(new Error(`Duplicate option ids in modification '${m.name}'`));
        }

        // 3) Validate base radio invariant & options constraints
        const baseRadios = mods.filter((m: any) => m.kind === "radio" && m.isBase === true && m.isDeleted !== true);
        if (baseRadios.length !== 1) {
            return next(new Error("Exactly one base radio modification (isBase=true) is required"));
        }
        const base = baseRadios[0];
        const baseActiveOpts = activeOptions(base);
        if (baseActiveOpts.length < 1) {
            return next(new Error("Base radio must have at least one active option"));
        }
        if (!base.defaultOptionId) {
            return next(new Error("Base radio requires defaultOptionId"));
        }
        if (!baseActiveOpts.some((o: any) => o.id === base.defaultOptionId)) {
            return next(new Error("Base radio defaultOptionId must refer to an active option"));
        }

        // 4) Validate other modification groups
        for (const m of mods) {
            const active = activeOptions(m);
            if (active.length === 0)
                return next(new Error(`Modification '${m.name}' must have at least one active option`));

            if (m.kind === "radio") {
                if (m !== base && m.isBase === true) {
                    return next(new Error(`Only one radio modification can be base`));
                }
                if (m.defaultOptionId && !active.some((o: any) => o.id === m.defaultOptionId)) {
                    return next(new Error(`Radio modification '${m.name}': defaultOptionId must be an active option`));
                }
            }

            if (m.kind === "checkbox") {
                const min = m.minSelected ?? 0;
                const max = m.maxSelected ?? active.length;
                if (!Number.isInteger(min) || min < 0)
                    return next(new Error(`Checkbox '${m.name}': minSelected must be ≥ 0`));
                if (!Number.isInteger(max) || max < 0)
                    return next(new Error(`Checkbox '${m.name}': maxSelected must be ≥ 0`));
                if (min > max) return next(new Error(`Checkbox '${m.name}': minSelected cannot exceed maxSelected`));
                if (max > active.length)
                    return next(new Error(`Checkbox '${m.name}': maxSelected cannot exceed active options`));
                if (m.isBase === true) return next(new Error(`Checkbox modification cannot be base`));
            }

            // Option price checked by schema (min: 0). Interpretation:
            // - base radio option price = ABSOLUTE base price
            // - other options' price = DELTA
        }

        // 5) Validate attribute values against Category
        if (doc.categoryId && attrVals.length > 0) {
            const cat = await CategoryModel.findOne({ _id: doc.categoryId, isDeleted: false }).lean();
            if (!cat) return next(new Error("Category not found or archived for this product"));

            const defMap = new Map<string, any>();
            for (const d of cat.attributes ?? []) if (!d.isDeleted) defMap.set(d.id, d);

            for (const v of attrVals) {
                const def = defMap.get(v.defId);
                if (!def) return next(new Error(`Attribute def '${v.defId}' not found on category or is deleted`));
                if (def.kind !== v.kind) return next(new Error(`Attribute kind mismatch for def '${v.defId}'`));

                const activeIds = new Set((def.options ?? []).filter((o: any) => !o.isDeleted).map((o: any) => o.id));

                if (v.kind === "switch") {
                    if (!activeIds.has((v as any).selectedOptionId)) {
                        return next(new Error(`Switch '${def.name}': selectedOptionId not in active options`));
                    }
                } else if (v.kind === "radio") {
                    const sel = (v as any).selectedOptionId;
                    if (sel !== undefined && !activeIds.has(sel)) {
                        return next(new Error(`Radio '${def.name}': selectedOptionId not in active options`));
                    }
                    if (def.isRequired && !sel) {
                        return next(new Error(`Radio '${def.name}' is required but no selection provided`));
                    }
                } else if (v.kind === "checkbox") {
                    const sels: string[] = (v as any).selectedOptionIds ?? [];
                    const uniq = new Set(sels);
                    if (uniq.size !== sels.length)
                        return next(new Error(`Checkbox '${def.name}': duplicate selections`));
                    for (const id of sels)
                        if (!activeIds.has(id))
                            return next(new Error(`Checkbox '${def.name}': selection not in active options`));
                    const min = def.minSelected ?? 0;
                    const max = def.maxSelected ?? activeIds.size;
                    if (sels.length < min || sels.length > max) {
                        return next(new Error(`Checkbox '${def.name}': selections must be between ${min} and ${max}`));
                    }
                }
            }
        }

        next();
    } catch (err) {
        next(err as any);
    }
});

export type ProductDoc = HydratedDocument<Product>;
export const ProductModel = model<Product>("Product", ProductSchema);
