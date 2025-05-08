import {ActivatedAbilityDef} from "../defs";
import Card from "./Card";
import {abilityEffects, activatedAbilitiesCosts} from "./workers";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ActivateAbility} from "./events";
import Player from "./Player";

export default class ActivatedAbility {
    owner: Player;

    def: ActivatedAbilityDef;
    card: Card;

    constructor(owner: Player, abilityDef: ActivatedAbilityDef, card: Card) {
        this.owner = owner;
        this.def = abilityDef;
        this.card = card;
    }

    label() {
        return `${this.def.cost}: ${this.def.effects.map(e => abilityEffects.get(e.type).label(e, this.card)).join(", ")}`
    }

    perform() {
        if (!activatedAbilitiesCosts.get(this.def.cost).payable(this.card, this.owner)) {
            console.log("Attempted to trigger unpayable ability")
            return;
        }

        gameEventManager.addEvent(new GameEvent_ActivateAbility(this));
    }
}