import { Ability } from "@engine/abilities";
import playerActionManager,{ type ActionTarget } from "@engine/actions/PlayerActionManager";
import { Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    player: Player;
    permanent: Permanent;
    ability: Ability;
    readonly targets: readonly ActionTarget[];

    constructor(player: Player, permanent: Permanent, ability: Ability, targets: readonly ActionTarget[] = []) {
        super();

        this.player = player;
        this.permanent = permanent;
        this.ability = ability;
        this.targets = [...targets];

        // TODO: Log ability label
        this.label = `Player ${player.id} activated ability of ${permanent.logName} (TODO)`;
    }

    perform(): boolean {
        if (this.permanent.controller !== this.player
            || !this.permanent.canActivate(this.ability, playerActionManager.isPayingManaCost(this.player)))
            return false;

        const targeter = this.ability.targeter;
        if (targeter ? !targeter.validateTargets(this.targets) : this.targets.length > 0)
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
        game.stack.abilityActivated(this.player, this.ability, this.targets);

        return true;
    }
}
