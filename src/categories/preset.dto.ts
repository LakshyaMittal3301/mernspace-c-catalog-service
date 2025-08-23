export type CreatePresetBase = {
    name: string;
    kind: "radio" | "checkbox";
    options: { label: string; isDeleted?: boolean; deletedAt?: Date }[];
};

export type CreateRadioPresetDto = CreatePresetBase & {
    kind: "radio";
    defaultOptionIndex?: number;
    isRequired?: boolean;
};

export type CreateCheckboxPresetDto = CreatePresetBase & {
    kind: "checkbox";
    minSelected?: number;
    maxSelected?: number;
};

export type CreatePresetDto = CreateRadioPresetDto | CreateCheckboxPresetDto;
