import { AttributeDefinition, SwitchAttributeDef, RadioAttributeDef, CheckboxAttributeDef } from "../types/attributes";

export const isSwitchDef = (d: AttributeDefinition): d is SwitchAttributeDef => d.kind === "switch";
export const isRadioDef = (d: AttributeDefinition): d is RadioAttributeDef => d.kind === "radio";
export const isCheckboxDef = (d: AttributeDefinition): d is CheckboxAttributeDef => d.kind === "checkbox";
