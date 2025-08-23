export type CreateBaseAttribute = {
    name: string;
    kind: "radio" | "checkbox" | "switch";
    options: { label: string; isDeleted?: boolean; deletedAt?: Date }[];
};

export type CreateSwitchAttribute = CreateBaseAttribute & {
    kind: "switch";
    defaultOptionIndex: number; // required for switch
};

export type CreateRadioAttribute = CreateBaseAttribute & {
    kind: "radio";
    defaultOptionIndex?: number; // optional for radio
    isRequired?: boolean;
};

export type CreateCheckboxAttribute = CreateBaseAttribute & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type CreateAttributeDto = CreateSwitchAttribute | CreateRadioAttribute | CreateCheckboxAttribute;

export type UpdateAttributeDto = {
    name?: string;
    isRequired?: boolean;
    minSelected?: number;
    maxSelected?: number;
};

export type AddAttributeOptionsDto = {
    options: Array<{ label: string }>;
};

export type UpdateAttributeOptionDto = {
    label: string;
};

export type SetAttributeDefaultDto = {
    optionId: string | null; // service enforces per-kind rules (radio: string|null, switch: string only)
};
