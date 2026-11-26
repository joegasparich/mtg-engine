import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_DrawCard,GameEvent_DrawCards } from "@engine/events";
import Player from "@engine/Player";
import { type GrammarKey,resolveAbilityGrammar } from "../../index";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DrawCards extends AbilityPart_Effect {
    target: GrammarKey;
    count: number | GrammarKey = 1;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.target, this.ability);
        const count = typeof this.count === "number" ? this.count : resolveAbilityGrammar(this.count, this.ability);
        if (!(player instanceof Player) || typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0)
            return;

        effect.emit(count === 1 ? new GameEvent_DrawCard(player) : new GameEvent_DrawCards(player, count));
    }
}
