import { Ability } from "@engine/abilities";
import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager,{ type ActionTarget } from "@engine/actions/PlayerActionManager";
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
        return this.ability.activateString;
    }

    perform(player: Player) {
        if (!player || !this.object.canActivate(this.ability, player))
            return;

        const activate = (targets: readonly ActionTarget[] = []) => {
            gameEventManager.addEvent(new GameEvent_ActivateAbility(player, this.object, this.ability, targets));
        };
        const targeter = this.ability.targeter;
        if (targeter) {
            // 602.2b and 601.2c: Choose targets before paying activation costs.
            playerActionManager.startTargeting(this.object, targeter.targetTypes, targeter.count,
                targets => targeter.validateTargets(targets), activate, targeter.zone);
        } else {
            activate();
        }
    }
}
