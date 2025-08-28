import Card from "../Card";
import Player from "../Player";
import {PlayerAction} from "./PlayerAction";
import gameEventManager from "../events/GameEventManager";
import {GameEvent_ActivateAbility} from "../events";
import {Ability} from "../Ability";

export class PlayerAction_ActivateAbility extends PlayerAction {
    ability: Ability;
    targets: null; // TODO

    constructor(card: Card, ability: Ability) {
        super(card);

        this.ability = ability;
    }

    label() {
        return "";//`${ActivatedAbilityCosts.get(this.abilityDef.cost).label}: ${this.abilityDef.effects.map(e => AbilityEffects.get(e.worker).label(e)).join(", ")}`;
    }

    perform(player: Player) {
        gameEventManager.addEvent(new GameEvent_ActivateAbility(player, this.card, this.ability, this.targets));
    }
}