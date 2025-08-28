import {Ability} from ".";
import {AbilityParts} from "./registry";
import {AbilityDef} from "~/defs";
import Card from "@engine/Card";
import {ActionTarget} from "@engine/actions";

export {Ability} from "./Ability";
export {AbilityPart} from "./parts/AbilityPart";
export {AbilityPart_Activate} from "./parts/activate/AbilityPart_Activate";
export {AbilityPart_Effect} from "./parts/effect/AbilityPart_Effect";
export {AbilityPart_Effect_AddMana} from "./parts/effect/AbilityPart_Effect_AddMana";
export {AbilityPart_Trigger} from "./parts/trigger/AbilityPart_Trigger";

export type GrammarKey = string;
export type SlateVar = "THIS"

export function makeAbility(def: AbilityDef, card: Card): Ability {
    const ability = new Ability(card);

    ability.def = def;

    for (const className in def.parts) {
        const ctor = AbilityParts[className];
        if (!ctor)
            continue;

        const part = new ctor();
        Object.assign(part, def.parts[className]);
        ability.addPart(part);
    }

    return ability;
}

export function resolveAbilityGrammar(key: GrammarKey, ability: Ability): ActionTarget {
    const parts = key.split(".");

    let result = null;

    for (const part of parts) {
        if (ability.slate[part])
            result = ability.slate[part];
        else if (part === "controller")
            result = (result as Card)?.controller;
        else if (part === "owner")
            result = (result as Card)?.owner;
    }

    return result;
}