import { Ability } from "@engine/abilities";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    player: Player;
    permanent: Permanent;
    ability: Ability;

    constructor(player: Player, permanent: Permanent, ability: Ability) {
        super();

        this.player = player;
        this.permanent = permanent;
        this.ability = ability;

        // TODO: Log ability label
        this.label = `Player ${player.id} activated ability of ${permanent.logName} (TODO)`;
    }

    perform(): boolean {
        if (this.permanent.controller !== this.player
            || !this.permanent.canActivate(this.ability, playerActionManager.isPayingManaCost(this.player)))
            return false;

        if (!this.ability.payActivationCost())
            return false;

        if (game.priorityPlayer === this.player)
            game.notePriorityAction();

        // 605.3b
        if (this.ability.def.isManaAbility) {
            this.ability.resolveActivation();
            return true;
        }

        // Add ability to stack
        game.stack.abilityActivated(this.player, this.ability);

        return true;
    }
}
