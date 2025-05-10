import {ActivatedAbilityDef, CardDef, CardType} from "../defs";
import {Battlefield, Hand, Zone} from "./Zone";
import {game} from "./root";
import Player from "./Player";
import {StepIndex} from "./Step";
import {PlayerAction, PlayerAction_ActivatedAbility, PlayerAction_PlayCard} from "./PlayerAction";
import {activatedAbilitiesCosts} from "./workers";

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
    cost: number[]; // W U B R G Colourless Any
    activatedAbilities: ActivatedAbilityDef[] = [];

    constructor(cardDef: CardDef, owner: Player) {
        this.def = cardDef;
        this.owner = owner;
        this.controller = owner;

        this.copyFromDef(cardDef)
    }

    copyFromDef(cardDef: CardDef) {
        this.name = cardDef.name;
        this.type = cardDef.type

        if (cardDef.cost)
            this.parseCost(cardDef.cost)

        if (cardDef.activated_abilities)
            this.activatedAbilities = [...cardDef.activated_abilities];
    }

    parseCost(cost: string) {
        this.cost = [0, 0, 0, 0, 0, 0, 0];
        const pips = cost.split("}").slice(0, -1).map(c => c.substring(1));
        for (const pip of pips) {
            switch (pip) {
                case "W": this.cost[0]++; break;
                case "U": this.cost[1]++; break;
                case "B": this.cost[2]++; break;
                case "R": this.cost[3]++; break;
                case "G": this.cost[4]++; break;
                case "C": this.cost[5]++; break;
                default:  this.cost[6] += parseInt(pip); break;
            }
        }
    }

    public getActions(actor: Player): PlayerAction[] {
        const actions: PlayerAction[] = [];

        if (actor != this.controller)
            return actions;

        if (this.zone instanceof Hand) {
            if (actor.manaPool.canPay(this.cost) && this.canPlay()) {
                actions.push(new PlayerAction_PlayCard(this));
            }
        }

        if (this.zone instanceof Battlefield) {
            for (const abilityDef of this.activatedAbilities) {
                if (this.canActivate(abilityDef) && activatedAbilitiesCosts.get(abilityDef.cost).payable(this, actor)) {
                    actions.push(new PlayerAction_ActivatedAbility(abilityDef, this));
                }
            }
        }

        return actions;
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
