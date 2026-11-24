import Card from "@engine/Card";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield,Zone } from "@engine/Zone";

export class GameEvent_ChangeCardZone extends GameEvent {
    type = GameEventType.ChangeCardZone;

    card: Card;
    oldZone: Zone;
    newZone: Zone;

    constructor(card: Card, newZone: Zone) {
        super();

        this.card = card;
        this.oldZone = card.zone;
        this.newZone = newZone;

        this.label = `Card ${this.card.logName} changed zones from ${this.card.zone?.name} to ${this.newZone.name}`;
    }

    perform(): boolean {
        if (this.card.zone instanceof Battlefield)
            CombatManager.removeFromCombat(this.card);
        this.card.preChangeZone();
        this.card.zone?.onLeave(this.card);
        this.card.zone = this.newZone;
        this.card.postChangeZone();
        this.newZone.onEnter(this.card);
        return true;
    }
}
