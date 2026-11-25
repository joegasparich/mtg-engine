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
        const recipientLogName = recipient instanceof Player ? this.recipientName : recipient.logName;
        this.label = `${source.logName} dealt ${amount} damage to ${recipientLogName}`;
    }

    get recipientName() {
        return this.recipient instanceof Player ? `Player ${this.recipient.id}` : this.recipient.name;
    }

    get affectedPlayer() {
        return this.recipient instanceof Player ? this.recipient : this.recipient.controller;
    }

    withAmount(amount: number): GameEvent_DealDamage {
        if (amount === this.amount)
            return this;

        const event = new GameEvent_DealDamage(this.source, this.recipient, amount);
        event.isAction = this.isAction;
        event.effect = this.effect;
        event.callback = this.callback;
        return event;
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
        return this.amount > 0 && Number.isSafeInteger(this.amount) && (this.recipient instanceof Player
            ? game.players.includes(this.recipient)
            : this.recipient.zone instanceof Battlefield && this.recipient.type === CardType.Creature);
    }
}
