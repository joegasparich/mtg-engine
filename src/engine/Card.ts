import {Battlefield, Zone} from "@engine/Zone";
import Player from "@engine/Player";
import {CardDef, CardType, Keyword} from "~/defs";
import {ManaAmount, ManaCost, ManaUtility} from "@engine/mana";
import {Ability, makeAbility} from "@engine/abilities";
import {game} from "@engine/Game";
import {StepIndex} from "@engine/Step";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ChangeCardZone, GameEvent_DestroyPermanent} from "@engine/events";

let idCounter = 0;

export default class Card {
    // Ownership
    readonly owner: Player;
    controller: Player;

    readonly def: CardDef;
    readonly id: number;

    get logName () {return `${this.name} (${this.id})`;}

    // State
    zone: Zone;
    tapped = false;
    damageTaken = 0;

    // Characteristics
    name: string;
    type: CardType;
    cost: ManaCost;
    power: number;
    toughness: number;
    abilities: Ability[] = [];

    constructor(cardDef: CardDef, owner: Player) {
        this.id = idCounter++;

        this.def = cardDef;
        this.owner = owner;
        this.controller = owner;

        this.copyFromDef(cardDef);
    }

    copyFromDef(cardDef: CardDef) {
        this.name = cardDef.name;
        this.type = cardDef.type;

        this.power = cardDef.power;
        this.toughness = cardDef.toughness;

        if (cardDef.cost)
            this.cost = [...ManaUtility.parseManaString<ManaCost>(cardDef.cost)];

        if (cardDef.abilities)
            this.abilities = cardDef.abilities.map(def => makeAbility(def, this));
    }

    public getPotentialMana(actor: Player): Readonly<ManaAmount> {
        // TODO: Optimise with a canAddMana flag?
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        if (this.zone instanceof Battlefield) {
            for (const ability of this.abilities) {
                if (ability.activatable && ability.canActivate(this))
                    ManaUtility.addMana(potentialMana, ability.getPotentialMana());
            }
        }

        return potentialMana;
    }

    canPlay() {
        if (game.activePlayer() != this.controller)
            return false;

        if (game.currentStepIndex != StepIndex.Main && game.currentStepIndex != StepIndex.SecondMain)
            return false;

        return true;
    }

    canActivate(ability: Ability) {
        if (game.activePlayer() != this.controller)
            return false;

        if (!ability.activatable)
            return false;

        return ability.canActivate(this);
    }

    checkState() {
        // 704.5f
        if (this.zone instanceof Battlefield && this.damageTaken >= this.toughness)
            gameEventManager.addEvent(new GameEvent_DestroyPermanent(this));
    }

    destroy() {
        if (!(this.zone instanceof Battlefield)) {
            console.error(`${this.logName} was destroyed but was not on battlefield`);
            return;
        }

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(this, this.owner.graveyard));
    }

    preChangeZone() {
        this.abilities.forEach(a => a.cleanup());
    }

    postChangeZone() {
        // Reset all state
        this.damageTaken = 0;
        this.tapped = false;

        this.copyFromDef(this.def);
    }

    // Getters
    hasKeyword(keyword: Keyword) {
        return this.abilities.some(a => a.def.keyword === keyword);
    }
}
