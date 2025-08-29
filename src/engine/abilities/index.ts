import {Ability, AbilityPart_Activate} from ".";
import {AbilityDef} from "~/defs";
import Card from "@engine/Card";
import {ActionTarget} from "@engine/actions";

export {Ability} from "./Ability";
export {AbilityPart} from "./parts/AbilityPart";
export {AbilityPart_Activate} from "./parts/activate/AbilityPart_Activate";
export {AbilityPart_Effect} from "./parts/effect/AbilityPart_Effect";
export {AbilityPart_Effect_AddMana} from "./parts/effect/AbilityPart_Effect_AddMana";
export {AbilityPart_Trigger} from "./parts/trigger/AbilityPart_Trigger";

import {AbilityParts} from "./registry";
import {keywordData} from "~/index";

// Ensures all parts are imported, since we are instantiating them by reflection
import.meta.glob("./parts/**/*.ts", { eager: true });

export type GrammarKey = string;
export type SlateVar = "THIS"
export const HardcodedSignals = {
    SpellResolve: "SPELL_RESOLVE"
};

export function makeAbility(def: AbilityDef, card: Card): Ability {
    const ability = new Ability(card);

    ability.def = def;

    if (def.keyword)
        ability.def = keywordData[def.keyword];

    let hasActivatePart = false;

    for (const className in ability.def.parts) {
        const ctor = AbilityParts[className];
        if (!ctor)
            continue;

        const part = new ctor();
        Object.assign(part, ability.def.parts[className]);

        if (part instanceof AbilityPart_Activate) {
            if (hasActivatePart)
                throw new Error(`Ability on ${card.def.name} has multiple activate parts`);

            hasActivatePart = true;
        }

        ability.addPart(part);
    }

    return ability;
}

export function resolveAbilityGrammar(key: GrammarKey, ability: Ability): ActionTarget {
    const parts = key.split(".");

    let result: ActionTarget = null;

    // TODO: Handle multiple targets in slate
    for (const part of parts) {
        if (ability.slate[part])
            result = ability.slate[part][0];
        else if (part === "controller")
            result = (result as Card)?.controller;
        else if (part === "owner")
            result = (result as Card)?.owner;
    }

    return result;
}