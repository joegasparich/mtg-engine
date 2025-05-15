import {ActivatedAbilityDef} from "../../defs";
import Card from "../Card";
import {AbilityEffects} from "../workers/AbilityEffects";
import Player from "../Player";
import ActivatedAbility from "../ActivatedAbility";
import {PlayerAction} from "./PlayerAction";
import {ActivatedAbilityCosts} from "../workers/ActivatedAbilityCosts";

export class PlayerAction_ActivateAbility implements PlayerAction {
    abilityDef: ActivatedAbilityDef;
    card: Card;
    targets: null;

    constructor(abilityDef: ActivatedAbilityDef, card: Card) {
        this.abilityDef = abilityDef;
        this.card = card;
    }

    label() {
        return `${ActivatedAbilityCosts.get(this.abilityDef.cost).label}: ${this.abilityDef.effects.map(e => AbilityEffects.get(e.worker).label(e, this.card)).join(", ")}`;
    }

    perform(player: Player) {
        const ability = new ActivatedAbility(player, this.abilityDef, this.card);

        ability.perform();
    }
}