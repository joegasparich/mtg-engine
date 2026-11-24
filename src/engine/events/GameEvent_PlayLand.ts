import Card from "@engine/Card";
import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { CardType } from "~/defs";

export class GameEvent_PlayLand extends GameEvent {
    type = GameEventType.PlayLand;

    constructor(readonly player: Player, readonly card: Card) {
        super();

        this.label = `Player ${player.id} played ${card.logName}`;
    }

    perform(): boolean {
        if (this.card.type !== CardType.Land || this.player !== this.card.controller || !this.card.canPlay())
            return false;

        game.landPlayedThisTurn = true;
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(this.card, this.player.battlefield));
        return true;
    }
}
