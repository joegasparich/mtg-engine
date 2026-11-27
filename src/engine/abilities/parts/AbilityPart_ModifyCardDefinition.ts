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
        const draft: CardDef | CardObject | undefined = this.ability.slate[this.on]?.[0];
        if (!draft || draft instanceof CardObject || !Array.isArray(draft.types))
            return;
        if (this.addTypes.length)
            draft.types = [...new Set([...draft.types, ...this.addTypes])];
        if (this.powerToughness) {
            draft.power = this.powerToughness.power;
            draft.toughness = this.powerToughness.toughness;
        }
    }
}
