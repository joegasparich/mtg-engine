import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_AddMana } from "@engine/events/GameEvent_AddMana";
import Player from "@engine/Player";
import { type ManaAmount,ManaColour,ManaUtility } from "@engine/mana";
import { type CardColour,cardColours } from "~/defs";
import { GrammarKey,resolveAbilityGrammar } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_AddMana extends AbilityPart_Effect {
    target: GrammarKey;
    mana = "";
    manaFrom?: GrammarKey;
    colourFrom?: GrammarKey;
    amount = 1;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.target, this.ability);
        if (!(player instanceof Player))
            return;

        let mana: Readonly<ManaAmount>;
        if (this.manaFrom) {
            const stored: Readonly<ManaAmount> | undefined = this.ability.slate[this.manaFrom]?.[0];
            if (!Array.isArray(stored) || stored.length !== ManaColour.Generic
                || !stored.every(amount => Number.isSafeInteger(amount) && amount >= 0))
                return;
            mana = stored;
        } else if (this.colourFrom) {
            const colour: CardColour | undefined = this.ability.slate[this.colourFrom]?.[0];
            if (!cardColours.includes(colour) || !Number.isSafeInteger(this.amount) || this.amount <= 0)
                return;
            const chosen: ManaAmount = [0, 0, 0, 0, 0, 0];
            chosen[ManaColour[colour]] = this.amount;
            mana = chosen;
        } else {
            mana = ManaUtility.parseManaString<ManaAmount>(this.mana);
        }

        // 605.3b: Mana is available immediately, including while paying a cost.
        effect.performImmediate(new GameEvent_AddMana(player, mana));
    }
}
