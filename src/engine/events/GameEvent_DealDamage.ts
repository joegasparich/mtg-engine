import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type { CardObject,Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";

export class GameEvent_DealDamage extends GameEvent {
    type = GameEventType.DealDamage;

    constructor(readonly source: CardObject, readonly recipient: Permanent, readonly amount: number) {
        super();
        this.label = `${source.logName} dealt ${amount} damage to ${recipient.logName}`;
    }

    perform(): boolean {
        if (!(this.recipient.zone instanceof Battlefield) || this.amount <= 0)
            return false;

        // 120.3e: Damage from an ordinary source is marked on a creature.
        this.recipient.damageTaken += this.amount;
        return true;
    }
}
