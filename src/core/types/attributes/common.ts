export type AttributeKind = "checkbox" | "radio" | "switch";

export type BaseAttributeOption = {
    id: string;
    label: string;
    isDeleted?: boolean;
    deletedAt?: Date;
};
