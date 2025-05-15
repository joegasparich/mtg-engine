import {ActivatedAbilityDef} from "../defs";
import Card from "./Card";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ActivateAbility} from "./events";
import Player from "./Player";
import {ActivatedAbilityCosts} from "./workers/ActivatedAbilityCosts";
import {AbilityEffects} from "./workers/AbilityEffects";

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
        return `${this.def.cost}: ${this.def.effects.map(effectDef => AbilityEffects.get(effectDef.worker).label(effectDef, this.card)).join(", ")}`;
    }

    perform() {
        if (!ActivatedAbilityCosts.get(this.def.cost).payable(this.card, this.owner)) {
            console.log("Attempted to trigger unpayable ability");
            return;
        }

        gameEventManager.addEvent(new GameEvent_ActivateAbility(this));
    }
}