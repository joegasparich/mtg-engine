import type { ActionTarget } from "@engine/actions";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { CardObject,Permanent,Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import { Stack } from "@engine/Stack";
import { Battlefield,type Graveyard,type Zone } from "@engine/Zone";

type ZoneChangeOptions = {
    controller?: Player;
    attachedTo?: Permanent;
    illegalAttachmentDestination?: Graveyard;
    targets?: readonly ActionTarget[];
};

export class GameEvent_ChangeCardZone extends GameEvent {
    type = GameEventType.ChangeCardZone;
    readonly oldZone?: Zone;
    newObject?: CardObject;

    constructor(readonly oldObject: CardObject, public newZone: Zone,
        private readonly options?: ZoneChangeOptions) {
        super();
        this.oldZone = oldObject.zone;
        this.label = `Card ${oldObject.logName} changed zones from ${this.oldZone?.name} to ${newZone.name}`;
    }

    perform(): boolean {
        const { oldObject, oldZone, newZone, options } = this;
        if (oldObject.retired || oldObject.zone !== oldZone || oldZone === newZone)
            return false;

        // 400.7: Each zone change creates a new rules object for the same physical card.
        const controller = options?.controller ?? oldObject.controller ?? oldObject.owner;
        if (newZone instanceof Stack) {
            if (!options?.targets)
                return false;
            this.newObject = new Spell(oldObject.card, controller, options.targets);
        } else if (newZone instanceof Battlefield) {
            const permanent = new Permanent(oldObject.card, controller);
            const attachment = options?.attachedTo;
            if (attachment && !permanent.canAttachTo(attachment)) {
                const destination = options.illegalAttachmentDestination;
                if (!destination || destination === oldZone)
                    return false;

                this.newZone = destination;
                this.newObject = new CardObject(oldObject.card);
            } else {
                permanent.attachedTo = attachment;
                this.newObject = permanent;
            }
        } else {
            this.newObject = new CardObject(oldObject.card);
        }

        if (oldObject instanceof Permanent)
            CombatManager.removeFromCombat(oldObject);
        if (oldZone)
            oldZone.onLeave(oldObject);
        else
            oldObject.retire();

        this.newZone.onEnter(this.newObject);
        this.label = `Card ${oldObject.logName} changed zones from ${oldZone?.name} to ${this.newZone.name}`;
        return true;
    }
}

export class GameEvent_DestroyPermanent extends GameEvent_ChangeCardZone {
    type = GameEventType.DestroyPermanent;
    readonly additionalPerformedTypes = [GameEventType.ChangeCardZone];

    constructor(readonly permanent: Permanent) {
        super(permanent, permanent.owner.graveyard);
        this.label = `Permanent ${permanent.logName} destroyed`;
    }

    perform(): boolean {
        if (!(this.permanent.zone instanceof Battlefield) || !super.perform())
            return false;
        this.label = `Permanent ${this.permanent.logName} destroyed`;
        return true;
    }
}

export class GameEvent_SacrificePermanent extends GameEvent_ChangeCardZone {
    type = GameEventType.SacrificePermanent;
    readonly additionalPerformedTypes = [GameEventType.ChangeCardZone];

    constructor(readonly player: Player, readonly permanent: Permanent) {
        super(permanent, permanent.owner.graveyard);
    }

    perform(): boolean {
        // 701.21a: Only a permanent's controller can sacrifice it.
        if (this.permanent.controller !== this.player || !(this.permanent.zone instanceof Battlefield) || !super.perform())
            return false;

        this.label = `Player ${this.player.id} sacrificed ${this.permanent.logName}`;
        return true;
    }
}

export class GameEvent_DiscardCard extends GameEvent_ChangeCardZone {
    type = GameEventType.DiscardCard;
    readonly additionalPerformedTypes = [GameEventType.ChangeCardZone];

    constructor(readonly player: Player, readonly cardObject: CardObject) {
        super(cardObject, player.graveyard);
    }

    perform(): boolean {
        // 701.9a: Discard from the owner's hand.
        if (this.cardObject.owner !== this.player || this.cardObject.zone !== this.player.hand || !super.perform())
            return false;

        this.label = `Player ${this.player.id} discarded ${this.cardObject.logName}`;
        return true;
    }
}
