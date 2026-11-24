import { GameEvent_DrawCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Player from "@engine/Player";
import { GrammarKey,resolveAbilityGrammar } from "../../index";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DrawCards extends AbilityPart_Effect {
    target: GrammarKey;
    count: number;

    perform() {
        const player = resolveAbilityGrammar(this.target, this.ability) as Player;

        gameEventManager.addEvent(new GameEvent_DrawCard(player, this.count));
    }
}