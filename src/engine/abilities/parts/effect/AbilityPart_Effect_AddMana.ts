import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_AddMana } from "@engine/events/GameEvent_AddMana";
import Player from "@engine/Player";
import { type ManaAmount,ManaUtility } from "@engine/mana";
import { GrammarKey,resolveAbilityGrammar } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_AddMana extends AbilityPart_Effect {
    target: GrammarKey;
    mana: string;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.target, this.ability) as Player;
        const mana = ManaUtility.parseManaString<ManaAmount>(this.mana);

        // 605.3b: Mana is available immediately, including while paying a cost.
        effect.performImmediate(new GameEvent_AddMana(player, mana));
    }
}
