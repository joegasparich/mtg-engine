import {ActivatedAbilityDef} from "../../defs";
import Card from "../Card";
import {AbilityEffects} from "../abilities/AbilityEffects";
import Player from "../Player";
import ActivatedAbility from "../ActivatedAbility";
import {ActivatedAbilityCosts} from "../abilities/ActivatedAbilityCosts";
import {PlayerAction} from "./PlayerAction";

export class PlayerAction_ActivateAbility extends PlayerAction {
    abilityDef: ActivatedAbilityDef;
    targets: null;

    constructor(card: Card, abilityDef: ActivatedAbilityDef) {
        super(card);

        this.abilityDef = abilityDef;
    }

    label() {
        return `${ActivatedAbilityCosts.get(this.abilityDef.cost).label}: ${this.abilityDef.effects.map(e => AbilityEffects.get(e.worker).label(e, this.card)).join(", ")}`;
    }

    perform(player: Player) {
        const ability = new ActivatedAbility(player, this.abilityDef, this.card);

        ability.perform();
    }
}