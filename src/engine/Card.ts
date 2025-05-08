import {CardDef} from "../defs";
import {Zone} from "./Zone";
import {game} from "./root";
import Player from "./Player";
import {StepIndex} from "./Step";

export default class Card {
    // Ownership
    readonly owner: Player;
    controller: Player;

    readonly def: CardDef;

    // State
    zone: Zone;
    tapped = false;

    // Characteristics (eventually copy over everything from def
    cost: number[]; // W U B R G Colourless Any

    constructor(cardDef: CardDef, owner: Player) {
        this.def = cardDef;
        this.owner = owner;
        this.controller = owner;

        if (cardDef.cost)
            this.parseCost(cardDef.cost)
    }

    public Tapped() { return this.tapped }

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

    canPlay() {
        if (game.activePlayer() != this.controller)
            return false;

        if (game.currentStepIndex != StepIndex.Main && game.currentStepIndex != StepIndex.SecondMain)
            return false;

        return true;
    }
}
