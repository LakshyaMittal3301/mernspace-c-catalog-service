import { AttributeKind } from "./common";

export type BaseAttributeDef = {
    id: string;
    name: string;
    kind: AttributeKind;
    isDeleted?: boolean;
    deletedAt?: Date;
};

export type SwitchAttributeDef = BaseAttributeDef & {
    kind: "switch";
    options: [{ id: string; label: string }, { id: string; label: string }];
    defaultOptionId: string;
};

export type RadioAttributeDef = BaseAttributeDef & {
    kind: "radio";
    options: { id: string; label: string }[];
    defaultOptionId?: string;
    isRequired?: boolean;
};

export type CheckboxAttributeDef = BaseAttributeDef & {
    kind: "checkbox";
    options: { id: string; label: string }[];
    minSelected?: number;
    maxSelected?: number;
};

export type AttributeDefinition = SwitchAttributeDef | RadioAttributeDef | CheckboxAttributeDef;
