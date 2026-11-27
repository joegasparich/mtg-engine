import type { AbilityPart } from "@engine/abilities/parts/AbilityPart";
import type { ActionTarget } from "@engine/actions";
import { CombatManager } from "@engine/CombatManager";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { CardObject,Permanent,Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import { Stack } from "@engine/Stack";
import { Battlefield,type Graveyard,type Zone } from "@engine/Zone";
import { type RecordRulesEvent,RulesEventType,type ZoneChanged } from "./RulesEvent";

// CR 603.10a: Read the battlefield before any move, then confirm which moves actually occurred.
export function beforeZoneChange(prepare: (move: GameEvent_ChangeCardZone) => ((event: ZoneChanged) => void) | undefined) {
    return gameEventManager.rules.beforeBatch(actions => {
        const callbacks = new Map<GameEvent_ChangeCardZone, (event: ZoneChanged) => void>();
        for (const action of actions) {
            if (action instanceof GameEvent_ChangeCardZone) {
                const callback = prepare(action);
                if (callback) callbacks.set(action, callback);
            }
        }
        if (!callbacks.size) return;
        return events => {
            for (const event of events) {
                if (event.type === RulesEventType.ZoneChanged)
                    callbacks.get(event.cause)?.(event);
            }
        };
    });
}

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

    private entering?: Permanent;
    private timestamp?: number;

    override get timestampAssignment() {
        if (!this.canMove) return undefined;
        const card = this.oldObject;
        const player = this.entering?.controller ?? (this.newZone instanceof Stack ? this.options?.controller : undefined) ?? card.owner;
        return { card, player, assign: (timestamp: number) => { this.timestamp = timestamp; } };
    }

    protected get canMove() {
        // 400.1: Both players' battlefield lists represent the same zone.
        const origin = this.oldObject.zone;
        const fromBattlefield = origin instanceof Battlefield;
        const stillInOrigin = origin === this.oldZone || (fromBattlefield && this.oldZone instanceof Battlefield);
        return !this.oldObject.retired && stillInOrigin && origin !== this.newZone
            && (!(this.newZone instanceof Stack) || !!this.options?.targets)
            && !(fromBattlefield && this.newZone instanceof Battlefield);
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
        // 110.2b: A spell's caster remains the default controller if control of the spell changed.
        const baseController = this.resolvesPermanentSpell && oldObject instanceof Spell ? oldObject.caster : controller;
        const entering = new Permanent(oldObject.card, baseController);
        if (this.resolvesPermanentSpell && oldObject instanceof Spell)
            oldObject.carryResolutionEffectsTo(entering);

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

    perform(record: RecordRulesEvent): boolean {
        const { oldObject, oldZone, newZone, options } = this;
        const origin = oldObject.zone;
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
        if (origin)
            origin.onLeave(oldObject);
        else
            oldObject.retire();

        // 609.7a: Damage-source effects can follow a spell into the permanent it resolves as.
        if (this.resolvesPermanentSpell && oldObject instanceof Spell && this.newObject instanceof Permanent)
            oldObject.resolvedPermanent = this.newObject;

        if (this.timestamp !== undefined) this.newObject.timestamp = this.timestamp;
        this.newZone.onEnter(this.newObject);
        record({ type: RulesEventType.ZoneChanged, oldObject, oldZone: origin, newObject: this.newObject, newZone: this.newZone, cause: this });
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

    perform(record: RecordRulesEvent): boolean {
        if (!(this.permanent.zone instanceof Battlefield) || !super.perform(record))
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

    perform(record: RecordRulesEvent): boolean {
        if (!super.perform(record))
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

    perform(record: RecordRulesEvent): boolean {
        if (!super.perform(record))
            return false;

        this.label = `Player ${this.player.id} discarded ${this.cardObject.logName}`;
        return true;
    }
}
