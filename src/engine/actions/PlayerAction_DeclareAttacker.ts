import { PlayerAction } from "@engine/actions/PlayerAction";
import { ActionTarget } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";

export class PlayerAction_DeclareAttacker extends PlayerAction {
    label() {
        return `Declare ${this.card.name} as an attacker`;
    }

    perform(player: Player, _targets?: ActionTarget[]) {
        if (!this.canEdit(player) || !CombatManager.canAttack(this.card))
            return;

        CombatManager.attackingCreatures.set(this.card, game.randomOpponent(player));
    }

    withdraw(player: Player): boolean {
        return this.canEdit(player) && CombatManager.attackingCreatures.delete(this.card);
    }

    private canEdit(player: Player) {
        return !game.pendingTargeter && game.currentStepIndex === StepIndex.DeclareAttackers
            && player === game.activePlayer() && player === this.card.controller;
    }
}
