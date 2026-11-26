import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { type CardObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import { CardType } from "~/defs";

export type DamageRecipient = Permanent | Player;

export function canReceiveDamage(recipient: unknown): recipient is DamageRecipient {
    return recipient instanceof Player ? game.players.includes(recipient)
        : recipient instanceof Permanent && recipient.zone instanceof Battlefield && recipient.type === CardType.Creature;
}

export class GameEvent_DealDamage extends GameEvent {
    type = GameEventType.DealDamage;

    constructor(readonly source: CardObject, readonly recipient: DamageRecipient, readonly amount: number) {
        super();
        const recipientLogName = recipient instanceof Player ? this.recipientName : recipient.logName;
        this.label = `${source.logName} dealt ${amount} damage to ${recipientLogName}`;
    }

    get recipientName() {
        return this.getRecipientName();
    }

    get affectedPlayer() {
        return this.getAffectedPlayer();
    }

    getRecipientName(recipient = this.recipient): string {
        return recipient instanceof Player ? `Player ${recipient.id}` : recipient.name;
    }

    getAffectedPlayer(recipient = this.recipient): Player {
        return recipient instanceof Player ? recipient : recipient.controller;
    }

    withAmount(amount: number): GameEvent_DealDamage {
        return this.withRecipient(this.recipient, amount);
    }

    withRecipient(recipient: DamageRecipient, amount: number): GameEvent_DealDamage {
        if (recipient === this.recipient && amount === this.amount)
            return this;

        const event = new GameEvent_DealDamage(this.source, recipient, amount);
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

    canDealDamage(recipient = this.recipient): boolean {
        return this.amount > 0 && Number.isSafeInteger(this.amount) && canReceiveDamage(recipient);
    }
}
