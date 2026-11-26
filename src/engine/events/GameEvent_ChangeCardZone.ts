import type { AbilityPart } from "@engine/abilities/parts/AbilityPart";
import type { ActionTarget } from "@engine/actions";
import { CombatManager } from "@engine/CombatManager";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { CardObject,Permanent,Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import { Stack } from "@engine/Stack";
import { Battlefield,type Graveyard,type Zone } from "@engine/Zone";

type ZoneChangeOptions = {
    controller?: Player;
    attachedTo?: Permanent;
    illegalAttachmentDestination?: Graveyard;
    targets?: readonly ActionTarget[];
    chosenX?: number;
    chosenMode?: number;
};

export class GameEvent_ChangeCardZone extends GameEvent {
    type = GameEventType.ChangeCardZone;
    readonly oldZone?: Zone;
    newObject?: CardObject;
    resolvesPermanentSpell = false;

    constructor(readonly oldObject: CardObject, public newZone: Zone,
        private readonly options?: ZoneChangeOptions) {
        super();
        this.oldZone = oldObject.zone;
        this.label = `Card ${oldObject.logName} changed zones from ${this.oldZone?.name} to ${newZone.name}`;
    }

    override get additionalPerformedTypes(): readonly GameEventType[] {
        return this.type === GameEventType.ChangeCardZone ? [] : [GameEventType.ChangeCardZone];
    }

    private entering?: Permanent;

    protected get canMove() {
        return !this.oldObject.retired && this.oldObject.zone === this.oldZone && this.oldZone !== this.newZone
            && (!(this.newZone instanceof Stack) || !!this.options?.targets);
    }

    get departingPermanent() {
        return this.oldObject instanceof Permanent && this.oldZone instanceof Battlefield && this.canMove
            ? this.oldObject : undefined;
    }

    override get entryPreparation() {
        const { oldObject, newZone } = this;
        if (!(newZone instanceof Battlefield) || !this.canMove)
            return undefined;
        const player = this.options?.controller ?? oldObject.controller ?? oldObject.owner;
        return { player, prepare: (resume: () => void) => this.prepareEntry(player, resume) };
    }

    private prepareEntry(controller: Player, resume: () => void) {
        const { oldObject } = this;
        const entering = new Permanent(oldObject.card, controller);
        // 400.7a: Only an explicit colour change on the resolving spell carries over.
        if (this.resolvesPermanentSpell && oldObject instanceof Spell && oldObject.changedColours)
            entering.colours = new Set(oldObject.changedColours);

        // 614.5, 616.1c,f: Each replacement gets one opportunity. Copying can supply new ones.
        const applied = new Set<AbilityPart>();
        const next = () => {
            const [part] = entering.abilities.flatMap(ability => ability.parts)
                .filter(part => part.replaceEntry && !applied.has(part))
                .sort((a, b) => a.entryReplacementOrder - b.entryReplacementOrder);
            if (!part) {
                this.entering = entering;
                resume();
                return;
            }
            applied.add(part);
            part.replaceEntry(entering, next);
        };
        next();
    }

    perform(): boolean {
        const { oldObject, oldZone, newZone, options } = this;
        if (!this.canMove)
            return false;

        // 400.7: Each zone change creates a new rules object for the same physical card.
        const controller = options?.controller ?? oldObject.controller ?? oldObject.owner;
        if (newZone instanceof Stack) {
            this.newObject = new Spell(oldObject.card, controller, options.targets, options.chosenX, options.chosenMode);
        } else if (newZone instanceof Battlefield) {
            const permanent = this.entering;
            if (!permanent)
                return gameEventManager.performImmediate(this);
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

        // 609.7a: Damage-source effects can follow a spell into the permanent it resolves as.
        if (this.resolvesPermanentSpell && oldObject instanceof Spell && this.newObject instanceof Permanent)
            oldObject.resolvedPermanent = this.newObject;

        this.newZone.onEnter(this.newObject);
        this.label = `Card ${oldObject.logName} changed zones from ${oldZone?.name} to ${this.newZone.name}`;
        return true;
    }
}

export class GameEvent_DestroyPermanent extends GameEvent_ChangeCardZone {
    type = GameEventType.DestroyPermanent;

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

    constructor(readonly player: Player, readonly permanent: Permanent) {
        super(permanent, permanent.owner.graveyard);
    }

    protected override get canMove() {
        // 701.21a: Only a permanent's controller can sacrifice it.
        return this.permanent.controller === this.player && this.permanent.zone instanceof Battlefield && super.canMove;
    }

    perform(): boolean {
        if (!super.perform())
            return false;

        this.label = `Player ${this.player.id} sacrificed ${this.permanent.logName}`;
        return true;
    }
}

export class GameEvent_DiscardCard extends GameEvent_ChangeCardZone {
    type = GameEventType.DiscardCard;

    constructor(readonly player: Player, readonly cardObject: CardObject) {
        super(cardObject, player.graveyard);
    }

    protected override get canMove() {
        // 701.9a: Discard from the owner's hand.
        return this.cardObject.owner === this.player && this.cardObject.zone === this.player.hand && super.canMove;
    }

    perform(): boolean {
        if (!super.perform())
            return false;

        this.label = `Player ${this.player.id} discarded ${this.cardObject.logName}`;
        return true;
    }
}
