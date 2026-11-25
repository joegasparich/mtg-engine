import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import type { CardObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import { CardType } from "~/defs";

export class GameEvent_DealDamage extends GameEvent {
    type = GameEventType.DealDamage;

    constructor(readonly source: CardObject, readonly recipient: Permanent | Player, readonly amount: number) {
        super();
        const recipientName = recipient instanceof Player ? `Player ${recipient.id}` : recipient.logName;
        this.label = `${source.logName} dealt ${amount} damage to ${recipientName}`;
    }

    perform(): boolean {
        if (!this.canDealDamage())
            return false;

        // 120.3a and 120.3e: Ordinary damage causes life loss or is marked on a creature.
        if (this.recipient instanceof Player)
            this.recipient.life -= this.amount;
        else
            this.recipient.damageTaken += this.amount;
        return true;
    }

    canDealDamage(): boolean {
        return this.amount > 0 && Number.isFinite(this.amount) && (this.recipient instanceof Player
            ? game.players.includes(this.recipient)
            : this.recipient.zone instanceof Battlefield && this.recipient.type === CardType.Creature);
    }
}
