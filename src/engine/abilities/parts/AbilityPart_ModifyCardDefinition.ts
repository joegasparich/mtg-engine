import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { CardObject } from "@engine/GameObject";
import type { CardDef,CardType } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ModifyCardDefinition extends AbilityPart {
    inSignal: string;
    on: GrammarKey;
    addTypes: readonly CardType[] = [];
    powerToughness?: Pick<CardDef, "power" | "toughness">;

    onSignalFired(signal: string) {
        if (signal !== this.inSignal)
            return;
        const draft = this.ability.slate[this.on]?.[0];
        if (!draft || typeof draft !== "object" || draft instanceof CardObject || !("types" in draft) || !Array.isArray(draft.types))
            return;
        if (this.addTypes.length)
            draft.types = [...new Set([...draft.types, ...this.addTypes])];
        if (this.powerToughness) {
            const { power, toughness } = this.powerToughness;
            Object.assign(draft, { power, toughness });
        }
    }
}
