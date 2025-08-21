export type ModificationKind = "radio" | "checkbox";

export type BaseModificationGroup = {
    id: string;
    name: string;
    kind: ModificationKind;
    isDeleted?: boolean;
    deletedAt?: Date;
};

export type RadioModificationGroup = BaseModificationGroup & {
    kind: "radio";
    defaultOptionId?: string;
    isRequired?: boolean;
};

export type CheckboxModificationGroup = BaseModificationGroup & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type BaseModificationOptions = {
    id: string;
    label: string;
    isDeleted?: boolean;
    deletedAt?: Date;
};
