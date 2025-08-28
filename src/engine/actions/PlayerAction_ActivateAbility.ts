import {Ability} from "@engine/abilities";
import {PlayerAction} from "@engine/actions/PlayerAction";
import Card from "@engine/Card";
import Player from "@engine/Player";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ActivateAbility} from "@engine/events";

export class PlayerAction_ActivateAbility extends PlayerAction {
    ability: Ability;
    targets: null; // TODO

    constructor(card: Card, ability: Ability) {
        super(card);

        this.ability = ability;
    }

    label() {
        return this.ability.def.activateString;
    }

    perform(player: Player) {
        gameEventManager.addEvent(new GameEvent_ActivateAbility(player, this.card, this.ability, this.targets));
    }
}