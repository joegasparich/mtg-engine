import {AbilityPart} from "@engine/abilities/parts/AbilityPart";

export type AbilityPartConstructor = new () => AbilityPart;
export const AbilityParts: Record<string, AbilityPartConstructor> = {};

export function RegisterAbilityPart(target: AbilityPartConstructor) {
    AbilityParts[target.name] = target;
}