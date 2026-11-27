import { AbilityPart } from "@engine/abilities/parts/AbilityPart";

export type AbilityPartConstructor = new () => AbilityPart;
export const AbilityParts: Record<string, AbilityPartConstructor> = {};

export function RegisterAbilityPart(target: AbilityPartConstructor) {
    AbilityParts[target.name] = target;
}

export function createAbilityPart(name: string, config: object): AbilityPart | undefined {
    const ctor = AbilityParts[name];
    if (ctor)
        return Object.defineProperties(new ctor(), Object.getOwnPropertyDescriptors(config));
}
