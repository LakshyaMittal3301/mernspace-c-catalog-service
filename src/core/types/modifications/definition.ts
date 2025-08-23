import { BaseModificationOptions, CheckboxModificationGroup, RadioModificationGroup } from ".";

export type ModificationDefOption = BaseModificationOptions & {
    price: number;
};

export type RadioModificationDef = RadioModificationGroup & {
    isBase?: boolean;
    options: ModificationDefOption[];
};

export type CheckboxModificationDef = CheckboxModificationGroup & {
    options: ModificationDefOption[];
};

export type ModificationDef = CheckboxModificationDef | RadioModificationDef;
