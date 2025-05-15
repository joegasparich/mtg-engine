import {
    AbilityEffectDef_AddMana,
    ActivatedAbilityDef,
    CardDef,
    CardType, Keyword, KeywordMap,
    StaticAbilityDef
} from "../defs";
import {Battlefield, Zone} from "./Zone";
import {game} from "./Game";
import Player from "./Player";
import {StepIndex} from "./Step";
import {ManaAmount, ManaCost, ManaUtility} from "./mana";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ChangeCardZone,GameEvent_DestroyPermanent} from "./events";
import {ActivatedAbilityCosts} from "./abilities/ActivatedAbilityCosts";
import {StaticAbilities, StaticAbility} from "./abilities/staticAbilities";

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
    activatedAbilities: ActivatedAbilityDef[] = [];
    staticAbilities: StaticAbility[] = [];

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

        if (cardDef.activated_abilities)
            this.activatedAbilities = [...cardDef.activated_abilities];

        if (cardDef.static_abilities)
            cardDef.static_abilities.forEach(def => this.addStaticAbility(def));
    }

    public getPotentialMana(actor: Player): Readonly<ManaAmount> {
        // TODO: Optimise with a canAddMana flag?
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        if (this.zone instanceof Battlefield) {
            for (const abilityDef of this.activatedAbilities) {
                if (this.canActivate(abilityDef) && ActivatedAbilityCosts.get(abilityDef.cost).payable(this, actor)) {
                    for (const effect of abilityDef.effects) {
                        if (effect.worker == "AbilityEffect_AddMana") { // TODO: Improve? DefOf?
                            ManaUtility.AddMana(
                                potentialMana,
                                ManaUtility.parseManaString<ManaAmount>((effect as AbilityEffectDef_AddMana).mana)
                            );
                        }
                    }
                }
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

    canActivate(abilityDef: ActivatedAbilityDef) {
        if (game.activePlayer() != this.controller)
            return false;

        return true;
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

    onChangeZone() {
        // Reset all state
        this.damageTaken = 0;
        this.tapped = false;

        this.copyFromDef(this.def);
    }

    // Getters
    hasKeyword(keyword: Keyword) {
        return this.staticAbilities.find(a => a.keyword == keyword);
    }

    private addStaticAbility(def: StaticAbilityDef) {
        const ability = new StaticAbilities[KeywordMap[def.keyword] ?? def.worker](this);
        ability.keyword = def.keyword;

        this.staticAbilities.push(ability);
    }
}
