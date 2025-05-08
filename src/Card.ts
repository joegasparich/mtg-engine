import {CardDef} from "./CardDef";
import {Zone} from "./Zone";

export default class Card {
    // Ownership
    readonly ownerID: number;
    controllerID: number;

    readonly def: CardDef;

    // State
    zone: Zone;
    tapped = false;

    // Characteristics (eventually copy over everything from def
    cost: number[]; // W U B R G Colourless Any

    constructor(cardDef: CardDef, ownerID: number) {
        this.def = cardDef;
        this.ownerID = ownerID;
        this.controllerID = ownerID;

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
        return true;
    }
}
