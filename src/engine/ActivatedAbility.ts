import {ActivatedAbilityDef} from "../defs";
import Card from "./Card";
import {abilityEffects, activatedAbilitiesCosts} from "./workers";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ActivateAbility} from "./events";

export default class ActivatedAbility {
    ownerID: number;

    def: ActivatedAbilityDef;
    card: Card;

    constructor(ownerID: number, abilityDef: ActivatedAbilityDef, card: Card) {
        this.ownerID = ownerID;
        this.def = abilityDef;
        this.card = card;
    }

    label() {
        return `${this.def.cost}: ${this.def.effects.map(e => abilityEffects.get(e.type).label(e, this.card)).join(", ")}`
    }

    perform() {
        if (!activatedAbilitiesCosts.get(this.def.cost).payable(this.card, this.ownerID)) {
            console.log("Attempted to trigger unpayable ability")
            return;
        }

        gameEventManager.addEvent(new GameEvent_ActivateAbility(this));
    }
}