import { Ability } from "@engine/abilities";
import { PlayerAction } from "@engine/actions/PlayerAction";
import { Permanent } from "@engine/GameObject";
import { GameEvent_ActivateAbility } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Player from "@engine/Player";

export class PlayerAction_ActivateAbility extends PlayerAction<Permanent> {
    ability: Ability;

    constructor(permanent: Permanent, ability: Ability) {
        super(permanent);

        this.ability = ability;
    }

    label() {
        return this.ability.def.activateString;
    }

    perform(player: Player) {
        if (!player || player !== this.object.controller || this.object.zone !== player.battlefield
            || !this.object.abilities.includes(this.ability) || !this.object.canActivate(this.ability))
            return;

        gameEventManager.addEvent(new GameEvent_ActivateAbility(player, this.object, this.ability));
    }
}
