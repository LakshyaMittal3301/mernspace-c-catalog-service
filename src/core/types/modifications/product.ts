import { BaseModificationOptions, CheckboxModificationGroup, RadioModificationGroup } from ".";

export type ModificationDefOption = BaseModificationOptions & {
    price: number;
};

export type RadioModificationDef = RadioModificationGroup & {
    options: ModificationDefOption[];
};

export type CheckboxModificationDef = CheckboxModificationGroup & {
    options: ModificationDefOption[];
};

export type ModificationDef = CheckboxModificationDef | RadioModificationDef;
