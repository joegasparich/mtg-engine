import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_DrawCard,GameEvent_DrawCards } from "@engine/events";
import Player from "@engine/Player";
import { GrammarKey,resolveAbilityGrammar } from "../../index";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DrawCards extends AbilityPart_Effect {
    target: GrammarKey;
    count = 1;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.target, this.ability) as Player;

        effect.emit(this.count === 1 ? new GameEvent_DrawCard(player) : new GameEvent_DrawCards(player, this.count));
    }
}
