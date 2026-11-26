import { CardObject,Permanent } from "@engine/GameObject";
import { ActionTarget } from "@engine/actions";
import { AbilityDef } from "~/defs";
import { Ability } from ".";

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

    for (const [className, config] of expandParts(ability.def.parts)) {
        const ctor = AbilityParts[className];
        if (!ctor)
            continue;

        const part = new ctor();
        Object.assign(part, config);

        ability.addPart(part);
    }

    return ability;
}

type GrammarValue = ActionTarget | number | undefined;

enum GrammarProperty {
    Controller = "controller",
    Owner = "owner",
    AttachedTo = "attachedTo",
    Power = "power",
}

export function resolveAbilityGrammar(key: GrammarKey, ability: Ability): GrammarValue {
    const [variable, ...properties] = key.split(".");
    let result: GrammarValue = ability.slate[variable]?.[0];
    for (const property of properties) {
        if (!(result instanceof CardObject))
            return undefined;
        switch (property) {
            case GrammarProperty.Controller:
                result = result.controller ?? result.owner;
                break;
            case GrammarProperty.Owner:
                result = result.owner;
                break;
            case GrammarProperty.AttachedTo:
                // 303.4m and 608.2h: A retired source keeps its last known attachment.
                result = result instanceof Permanent ? result.attachedTo : undefined;
                break;
            case GrammarProperty.Power:
                result = result.power;
                break;
            default:
                return undefined;
        }
    }

    return result;
}
