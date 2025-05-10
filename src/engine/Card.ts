import {AbilityEffectDef_AddMana, AbilityEffectType, ActivatedAbilityDef, CardDef, CardType} from "../defs";
import {Battlefield, Hand, Zone} from "./Zone";
import {game} from "./root";
import Player from "./Player";
import {StepIndex} from "./Step";
import {PlayerAction, PlayerAction_ActivatedAbility, PlayerAction_PlayCard} from "./PlayerAction";
import {activatedAbilitiesCosts} from "./workers";
import {ManaAmount, ManaCost, ManaUtility} from "./mana";

export default class Card {
    // Ownership
    readonly owner: Player;
    controller: Player;

    readonly def: CardDef;

    // State
    zone: Zone;
    tapped = false;

    // Characteristics
    name: string;
    type: CardType;
    cost: ManaCost;
    activatedAbilities: ActivatedAbilityDef[] = [];

    constructor(cardDef: CardDef, owner: Player) {
        this.def = cardDef;
        this.owner = owner;
        this.controller = owner;

        this.copyFromDef(cardDef)
    }

    copyFromDef(cardDef: CardDef) {
        this.name = cardDef.name;
        this.type = cardDef.type;

        if (cardDef.cost)
            this.cost = [...ManaUtility.parseManaString<ManaCost>(cardDef.cost)];

        if (cardDef.activated_abilities)
            this.activatedAbilities = [...cardDef.activated_abilities];
    }

    public getActions(actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const actions: PlayerAction[] = [];

        if (actor != this.controller)
            return actions;

        if (this.zone instanceof Hand) {
            if (ManaUtility.canPay(this.cost, actor.manaPool) && this.canPlay()) {
                actions.push(new PlayerAction_PlayCard(this));
            }
        }

        if (this.zone instanceof Battlefield) {
            for (const abilityDef of this.activatedAbilities) {
                if (ignoreManaAbilities && abilityDef.manaAbility)
                    continue;

                if (this.canActivate(abilityDef) && activatedAbilitiesCosts.get(abilityDef.cost).payable(this, actor)) {
                    actions.push(new PlayerAction_ActivatedAbility(abilityDef, this));
                }
            }
        }

        return actions;
    }

    public getPotentialMana(actor: Player): Readonly<ManaAmount> {
        // TODO: Optimise with a canAddMana flag?
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        if (this.zone instanceof Battlefield) {
            for (const abilityDef of this.activatedAbilities) {
                if (this.canActivate(abilityDef) && activatedAbilitiesCosts.get(abilityDef.cost).payable(this, actor)) {
                    for (const effect of abilityDef.effects) {
                        if (effect.type == AbilityEffectType.AddMana) {
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
}
