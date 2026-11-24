import { PlayerAction } from "@engine/actions/PlayerAction";
import { ActionTarget } from "@engine/actions/PlayerActionManager";
import type { Permanent } from "@engine/GameObject";
import { CombatManager } from "@engine/CombatManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";

export class PlayerAction_DeclareAttacker extends PlayerAction<Permanent> {
    label() {
        return `Declare ${this.object.name} as an attacker`;
    }

    perform(player: Player, _targets?: ActionTarget[]) {
        if (!this.canEdit(player) || !CombatManager.canAttack(this.object))
            return;

        CombatManager.attackingCreatures.set(this.object, game.randomOpponent(player));
    }

    withdraw(player: Player): boolean {
        return this.canEdit(player) && CombatManager.attackingCreatures.delete(this.object);
    }

    private canEdit(player: Player) {
        return !game.pendingTargeter && game.currentStepIndex === StepIndex.DeclareAttackers
            && player === game.activePlayer() && player === this.object.controller;
    }
}
