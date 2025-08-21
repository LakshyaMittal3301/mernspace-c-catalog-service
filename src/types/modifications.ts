export type ModificationKind = "radio" | "checkbox";

type BaseModificationGroup = {
    id: string;
    name: string;
    kind: ModificationKind;
    isDeleted?: boolean;
    deletedAt?: Date;
};

type RadioModificationGroup = BaseModificationGroup & {
    kind: "radio";
    defaultOptionId?: string;
    isRequired?: boolean;
};

type CheckboxModificationGroup = BaseModificationGroup & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type PresetOptions = {
    id: string;
    label: string;
};

export type DefinitionOption = PresetOptions & {
    price: number;
};

export type RadioModificationPreset = RadioModificationGroup & {
    options: PresetOptions[];
};

export type CheckboxModificationPreset = CheckboxModificationGroup & {
    options: PresetOptions[];
};

export type ModificationPreset = RadioModificationPreset | CheckboxModificationPreset;

export type RadioModificationDef = RadioModificationGroup & {
    options: DefinitionOption[];
};

export type CheckboxModificationDef = CheckboxModificationGroup & {
    options: DefinitionOption[];
};

export type ModificationDef = CheckboxModificationDef | RadioModificationDef;
