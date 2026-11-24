import { PlayerAction } from "@engine/actions/PlayerAction";
import { ActionTarget } from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { CombatManager } from "@engine/CombatManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";

export class PlayerAction_DeclareBlocker extends PlayerAction {
    constructor(card: Card) {
        super(card);

        this.targets = CombatManager.potentialBlockTargetsFor(card);
    }

    label() {
        return `Declare ${this.card.name} as a blocker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        const target = targets?.[0];
        if (!this.canEdit(player) || !(target instanceof Card)
            || !CombatManager.canBlockAttacker(this.card, target))
            return;

        CombatManager.blockingCreatures.set(this.card, target);
    }

    withdraw(player: Player): boolean {
        return this.canEdit(player) && CombatManager.blockingCreatures.delete(this.card);
    }

    private canEdit(player: Player) {
        return !game.pendingTargeter && game.currentStepIndex === StepIndex.DeclareBlockers
            && player === game.activePlayer() && player === this.card.controller;
    }
}
