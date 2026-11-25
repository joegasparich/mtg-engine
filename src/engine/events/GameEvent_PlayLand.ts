import { CardObject } from "@engine/GameObject";
import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { CardType } from "~/defs";

export class GameEvent_PlayLand extends GameEvent {
    type = GameEventType.PlayLand;

    constructor(readonly player: Player, readonly handObject: CardObject) {
        super();

        this.label = `Player ${player.id} played ${handObject.logName}`;
    }

    perform(): boolean {
        if (this.handObject.type !== CardType.Land || this.player !== this.handObject.owner || !this.handObject.canPlay())
            return false;

        game.landPlayedThisTurn = true;
        game.notePriorityAction();
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(this.handObject, this.player.battlefield));
        return true;
    }
}
