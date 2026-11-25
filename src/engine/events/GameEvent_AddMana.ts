import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type Player from "@engine/Player";
import { type ManaAmount,ManaUtility } from "@engine/mana";

export class GameEvent_AddMana extends GameEvent {
    type = GameEventType.AddMana;

    constructor(readonly player: Player, readonly mana: Readonly<ManaAmount>) {
        super();
        this.label = `Player ${player.id} added mana`;
    }

    perform(): boolean {
        ManaUtility.addMana(this.player.manaPool, this.mana);
        return true;
    }
}
