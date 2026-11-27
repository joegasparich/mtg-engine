import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_DrawCard,GameEvent_DrawCards } from "@engine/events";
import { game } from "@engine/Game";
import { type GrammarKey,resolveAbilityGrammar } from "../../index";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DrawCards extends AbilityPart_Effect {
    playersFrom: string;
    count: number | GrammarKey = 1;

    perform(effect: OneShotEffect) {
        const count = typeof this.count === "number" ? this.count : resolveAbilityGrammar(this.count, this.ability);
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0)
            return;

        // CR 121.2c: Each selected player finishes their draws in active-player-first turn order.
        const selected = new Set(this.ability.slate[this.playersFrom]);
        const active = game.currentTurnPlayerID;
        const players = [...game.players.slice(active), ...game.players.slice(0, active)].filter(player => selected.has(player));
        for (const player of players) {
            const event = count === 1 ? new GameEvent_DrawCard(player) : new GameEvent_DrawCards(player, count);
            if (players.length === 1)
                effect.emit(event);
            else
                effect.continueResolution(() => effect.emit(event));
        }
    }
}
