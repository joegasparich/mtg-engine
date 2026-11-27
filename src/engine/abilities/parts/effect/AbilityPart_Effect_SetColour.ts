import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { CardObject } from "@engine/GameObject";
import type { CardColour } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_SetColour extends AbilityPart_Effect {
    target: GrammarKey;
    colour: CardColour;

    perform() {
        const recipient = resolveAbilityGrammar(this.target, this.ability);
        if (!(recipient instanceof CardObject) || !recipient.zone)
            return;

        // 105.3 and 611.2a: Replace the object's colours with no turn-based expiration.
        recipient.colours = new Set([this.colour]);
    }
}
