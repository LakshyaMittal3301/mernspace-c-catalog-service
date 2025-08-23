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

export type UpdatePresetDto = {
    name?: string; // any kind
    isRequired?: boolean; // radio only
    minSelected?: number; // checkbox only
    maxSelected?: number; // checkbox only
};

export type AddPresetOptionsDto = {
    options: Array<{ label: string }>;
};

export type UpdatePresetOptionDto = {
    label: string;
};

export type SetPresetDefaultDto = {
    optionId: string | null; // radio: string|null (clear allowed); checkbox: must be null → reject in service
};
