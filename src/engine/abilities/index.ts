import { CardObject,Permanent } from "@engine/GameObject";
import { ActionTarget } from "@engine/actions";
import { AbilityDef } from "~/defs";
import { Ability,AbilityPart_Activate } from ".";

export { Ability } from "./Ability";
export { AbilityPart } from "./parts/AbilityPart";
export { AbilityPart_Activate } from "./parts/activate/AbilityPart_Activate";
export { AbilityPart_Effect } from "./parts/effect/AbilityPart_Effect";
export { AbilityPart_Effect_AddMana } from "./parts/effect/AbilityPart_Effect_AddMana";
export { AbilityPart_Trigger } from "./parts/trigger/AbilityPart_Trigger";

import { keywordData } from "~/index";
import { AbilityParts } from "./registry";

// Ensures all parts are imported, since we are instantiating them by reflection
import.meta.glob("./parts/**/*.ts", { eager: true });

export type GrammarKey = string;
export type SlateVar = "THIS" | "CONTROLLER";
export const HardcodedSignals = {
    SpellResolve: "SPELL_RESOLVE",
};

function expandParts(parts: AbilityDef["parts"]): [string, object][] {
    return Object.entries(parts ?? {}).flatMap(([name, config]): [string, object][] => {
        if (name !== "SimpleAura")
            return [[name, config]];

        const { targetValidator } = parts.SimpleAura;
        const target = "ENCHANTED";
        const attachment = "ATTACHMENT";
        return [
            ["AbilityPart_AuraTarget", { saveAs: target, targetValidator }],
            ["AbilityPart_Attach", { inSignal: HardcodedSignals.SpellResolve, target, saveAs: attachment, targetValidator }],
            ["AbilityPart_Aura", { attachmentFrom: attachment }],
        ];
    });
}

export function makeAbility(def: AbilityDef, source: CardObject, grantedBy?: CardObject): Ability {
    const ability = new Ability(source, grantedBy);

    ability.def = def;

    if (def.keyword)
        ability.def = keywordData[def.keyword];

    let hasActivatePart = false;

    for (const [className, config] of expandParts(ability.def.parts)) {
        const ctor = AbilityParts[className];
        if (!ctor)
            continue;

        const part = new ctor();
        Object.assign(part, config);

        if (part instanceof AbilityPart_Activate) {
            if (hasActivatePart)
                throw new Error(`Ability on ${source.def.name} has multiple activate parts`);

            hasActivatePart = true;
        }

        ability.addPart(part);
    }

    return ability;
}

type GrammarValue = ActionTarget | undefined;

export function resolveAbilityGrammar(key: GrammarKey, ability: Ability): GrammarValue {
    const parts = key.split(".");

    let result: GrammarValue;

    // TODO: Handle multiple targets in slate
    for (const part of parts) {
        if (ability.slate[part])
            result = ability.slate[part][0];
        else if (part === "controller")
            result = result instanceof CardObject ? result.controller ?? result.owner : undefined;
        else if (part === "owner")
            result = result instanceof CardObject ? result.owner : undefined;
        else if (part === "attachedTo")
            // 303.4m and 608.2h: Read the current attachment, or its last known value on a retired source.
            result = result instanceof Permanent ? result.attachedTo : undefined;
    }

    return result;
}
