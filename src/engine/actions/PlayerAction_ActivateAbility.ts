import { Ability } from "@engine/abilities";
import { PlayerAction } from "@engine/actions/PlayerAction";
import Card from "@engine/Card";
import { GameEvent_ActivateAbility } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Player from "@engine/Player";

export class PlayerAction_ActivateAbility extends PlayerAction {
    ability: Ability;

    constructor(card: Card, ability: Ability) {
        super(card);

        this.ability = ability;
    }

    label() {
        return this.ability.def.activateString;
    }

    perform(player: Player) {
        if (!player || player !== this.card.controller || this.card.zone !== player.battlefield
            || !this.card.abilities.includes(this.ability) || !this.card.canActivate(this.ability))
            return;

        gameEventManager.addEvent(new GameEvent_ActivateAbility(player, this.card, this.ability));
    }
}
