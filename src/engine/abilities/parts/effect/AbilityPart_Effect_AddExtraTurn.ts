import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_AddExtraTurn } from "@engine/events/GameEvent_Step";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_AddExtraTurn extends AbilityPart_Effect {
    player: GrammarKey;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.player, this.ability);
        if (player instanceof Player)
            effect.emit(new GameEvent_AddExtraTurn(player));
    }
}
