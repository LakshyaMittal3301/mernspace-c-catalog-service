export type AttributeKind = "checkbox" | "radio" | "switch";

type BaseAttributeDef = {
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

type BaseAttributeVal = { defId: string; kind: AttributeKind };

export type SwitchAttributeVal = BaseAttributeVal & {
    kind: "switch";
    selectedOptionId: string;
};

export type RadioAttributeVal = BaseAttributeVal & {
    kind: "radio";
    selectedOptionId?: string;
};

export type CheckboxAttributeVal = BaseAttributeVal & {
    kind: "checkbox";
    selectedOptionIds: string[];
};

export type AttributeValue = SwitchAttributeVal | RadioAttributeVal | CheckboxAttributeVal;

export const isSwitchDef = (d: AttributeDefinition): d is SwitchAttributeDef => d.kind === "switch";
export const isRadioDef = (d: AttributeDefinition): d is RadioAttributeDef => d.kind === "radio";
export const isCheckboxDef = (d: AttributeDefinition): d is CheckboxAttributeDef => d.kind === "checkbox";
