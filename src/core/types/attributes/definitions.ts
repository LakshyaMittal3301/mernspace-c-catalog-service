import { AttributeKind, BaseAttributeOption } from "./common";

export type BaseAttributeDef = {
    id: string;
    name: string;
    kind: AttributeKind;
    isDeleted?: boolean;
    deletedAt?: Date;
};

export type SwitchAttributeDef = BaseAttributeDef & {
    kind: "switch";
    options: [BaseAttributeOption, BaseAttributeOption];
    defaultOptionId: string;
};

export type RadioAttributeDef = BaseAttributeDef & {
    kind: "radio";
    options: BaseAttributeOption[];
    defaultOptionId?: string;
    isRequired?: boolean;
};

export type CheckboxAttributeDef = BaseAttributeDef & {
    kind: "checkbox";
    options: BaseAttributeOption[];
    minSelected?: number;
    maxSelected?: number;
};

export type AttributeDefinition = SwitchAttributeDef | RadioAttributeDef | CheckboxAttributeDef;
