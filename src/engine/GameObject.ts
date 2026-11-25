import type { ActionTarget } from "@engine/actions";
import type Card from "@engine/Card";
import { Ability,makeAbility } from "@engine/abilities";
import { AbilityPart_Target } from "@engine/abilities/parts/AbilityPart_Target";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import gameEventManager,{ type GameEvent } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { Battlefield,Hand,Zone } from "@engine/Zone";
import { CardType,Keyword } from "~/defs";

let idCounter = 0;

export abstract class GameObject {
    readonly id = idCounter++;
    private currentZone?: Zone;
    private hasRetired = false;

    get zone() { return this.currentZone; }
    get retired() { return this.hasRetired; }

    enterZone(zone: Zone) {
        this.currentZone = zone;
    }

    retire() {
        this.currentZone = undefined;
        this.hasRetired = true;
    }
}

export class CardObject extends GameObject {
    readonly controller?: Player;
    get owner() { return this.card.owner; }
    get def() { return this.card.def; }
    get logName() { return `${this.name} (${this.id})`; }

    name: string;
    type: CardType;
    subtypes: readonly string[];
    cost?: ManaCost;
    power: number;
    toughness: number;
    abilities: Ability[];

    constructor(readonly card: Card) {
        super();
        const def = card.def;
        this.name = def.name;
        this.type = def.type;
        this.subtypes = [...(def.subtypes ?? [])];
        this.power = def.power;
        this.toughness = def.toughness;
        if (def.cost)
            this.cost = [...ManaUtility.parseManaString<ManaCost>(def.cost)];
        this.abilities = (def.abilities ?? []).map(ability => makeAbility(ability, this));
    }

    enterZone(zone: Zone) {
        super.enterZone(zone);
        this.abilities.forEach(ability => ability.setup());
    }

    retire() {
        this.abilities.forEach(ability => ability.cleanup());
        super.retire();
    }

    canPlay() {
        if (game.hasPendingPlayerInput)
            return false;

        if (!(this.zone instanceof Hand) || game.activePlayer() !== this.owner)
            return false;

        if (game.currentStepIndex != StepIndex.Main && game.currentStepIndex != StepIndex.SecondMain)
            return false;

        if (this.type === CardType.Land) {
            return this.zone === this.owner.hand
                && this.owner === game.currentTurnPlayer()
                && game.stack.objects.length === 0
                && !game.landPlayedThisTurn;
        }

        return this.spellTargeter?.hasLegalTargets() ?? true;
    }

    get spellTargeter(): AbilityPart_Target | undefined {
        for (const ability of this.abilities) {
            const target = ability.parts.find(part => part instanceof AbilityPart_Target);
            if (target)
                return target;
        }
    }

    checkState(actions: GameEvent[]) {
        for (const ability of this.abilities) {
            for (const part of ability.parts)
                part.checkState?.(actions);
        }
    }

    // Getters
    hasKeyword(keyword: Keyword) {
        return this.abilities.some(a => a.def.keyword === keyword);
    }
}


export class Permanent extends CardObject {
    attachedTo?: Permanent;
    tapped = false;
    damageTaken = 0;

    constructor(card: Card, override controller: Player, attachedTo?: Permanent) {
        super(card);
        this.attachedTo = attachedTo;
    }

    public getPotentialMana(actor: Player): Readonly<ManaAmount> {
        // TODO: Optimise with a canAddMana flag?
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        if (this.zone === actor.battlefield && this.controller === actor) {
            for (const ability of this.abilities) {
                if (ability.def.isManaAbility && ability.isFreeTap && ability.canActivate())
                    ManaUtility.addMana(potentialMana, ability.getPotentialMana());
            }
        }

        return potentialMana;
    }

    canActivate(ability: Ability) {
        if (game.hasPendingPlayerInput || game.activePlayer() != this.controller)
            return false;

        if (!ability.activatable)
            return false;

        return ability.canActivate();
    }

    hasLegalAttachment(): boolean {
        const target = this.attachedTo;
        return target?.zone instanceof Battlefield && this.abilities.every(ability =>
            ability.parts.every(part => part.canAttachTo?.(target) ?? true));
    }

    checkState(actions: GameEvent[]) {
        super.checkState(actions);
        if (this.type !== CardType.Creature || !(this.zone instanceof Battlefield))
            return;

        // 704.5f–g: Zero toughness puts a creature into the graveyard. Lethal damage destroys it.
        if (this.toughness <= 0)
            actions.push(new GameEvent_ChangeCardZone(this, this.owner.graveyard));
        else if (this.toughness > 0 && this.damageTaken >= this.toughness)
            actions.push(new GameEvent_DestroyPermanent(this));
    }

    destroy(): boolean {
        if (!(this.zone instanceof Battlefield)) {
            console.error(`${this.logName} was destroyed but was not on battlefield`);
            return false;
        }

        gameEventManager.addEvent(new GameEvent_DestroyPermanent(this));
        return true;
    }

}

export class Spell extends CardObject {
    readonly targets: readonly ActionTarget[];

    constructor(card: Card, override readonly controller: Player, targets: readonly ActionTarget[]) {
        super(card);
        this.targets = [...targets];
    }
}

export class StackAbility extends GameObject {
    readonly ability: Ability;

    constructor(readonly controller: Player, readonly source: CardObject, ability: Ability,
        private readonly signal: string, inputs: Ability["slate"] = {}) {
        super();
        // 113.7a: Each occurrence resolves independently of its source and other occurrences.
        this.ability = makeAbility(ability.def, source);
        for (const [key, value] of Object.entries({ ...ability.slate, ...inputs }))
            this.ability.slate[key] = Array.isArray(value) ? [...value] : value;
        this.ability.slate.CONTROLLER = [controller];
    }

    resolve() {
        if (this.zone)
            this.ability.fireSignal(this.signal);
    }
}
