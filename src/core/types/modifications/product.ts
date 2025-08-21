import { BaseModificationOptions, CheckboxModificationGroup, RadioModificationGroup } from ".";

export type ModificationDefOption = BaseModificationOptions & {
    price: number;
};

export type RadioModificationDef = RadioModificationGroup & {
    pricingMode?: "base" | "delta";
    options: ModificationDefOption[];
};

export type CheckboxModificationDef = CheckboxModificationGroup & {
    options: ModificationDefOption[];
};

export type ModificationDef = CheckboxModificationDef | RadioModificationDef;
