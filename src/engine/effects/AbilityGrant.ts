import type { CardObject } from "@engine/GameObject";
import type { Ability } from "@engine/abilities/Ability";
import type { AbilityDef } from "~/defs";
import { change,Layer,type LayerChange } from "./Layers";

export enum AbilityRemoval {
    Lose,
    CannotHave,
}

export function removeAbilities(matches: (ability: Ability) => boolean, mode = AbilityRemoval.Lose) {
    return change(Layer.Ability, () => [matches, mode] as const, (state, remove, removal) => {
        // 113.10b, 113.11: Remove every matching instance. A prohibition also prevents later gains.
        state.abilities = state.abilities.filter(ability => !remove(ability));
        if (removal === AbilityRemoval.CannotHave)
            state.prohibitedAbilities = [...(state.prohibitedAbilities ?? []), remove];
    });
}

export function abilityGrant(def: AbilityDef, source: CardObject, timestamp: () => number,
    readWords?: Ability["wordSource"]) {
    const instances = new WeakMap<CardObject, Ability>();
    function forObject(object: CardObject) {
        if (!instances.has(object)) {
            const ability = object.createAbility(def, source);
            ability.grantTimestamp = timestamp;
            ability.wordSource = readWords;
            instances.set(object, ability);
        }
        return instances.get(object);
    }
    const grant: LayerChange = change(Layer.Ability, object => [forObject(object)] as const,
        (state, ability) => { state.abilities = [...state.abilities, ability]; });
    grant.canStartOn = object => !object.characteristics.prohibitedAbilities?.some(matches => matches(forObject(object)));
    return { instances, forObject, change: grant };
}
