import { AttributeKind } from "./common";

export type BaseAttributeVal = { defId: string; kind: AttributeKind };

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
