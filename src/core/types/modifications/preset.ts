import { BaseModificationOptions, CheckboxModificationGroup, RadioModificationGroup } from ".";

export type PresetOptions = BaseModificationOptions;

export type RadioModificationPreset = RadioModificationGroup & {
    options: PresetOptions[];
};

export type CheckboxModificationPreset = CheckboxModificationGroup & {
    options: PresetOptions[];
};

export type ModificationPreset = RadioModificationPreset | CheckboxModificationPreset;
