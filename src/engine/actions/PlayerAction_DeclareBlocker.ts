import { PlayerAction } from "@engine/actions/PlayerAction";
import { ActionTarget } from "@engine/actions/PlayerActionManager";
import { Permanent } from "@engine/GameObject";
import { CombatManager } from "@engine/CombatManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";

export class PlayerAction_DeclareBlocker extends PlayerAction<Permanent> {
    constructor(blocker: Permanent) {
        super(blocker);

        this.targets = CombatManager.potentialBlockTargetsFor(blocker);
    }

    label() {
        return `Declare ${this.object.name} as a blocker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        const target = targets?.[0];
        if (!this.canEdit(player) || !(target instanceof Permanent))
            return;

        CombatManager.assignBlock(this.object, target);
    }

    withdraw(player: Player): boolean {
        return this.canEdit(player) && CombatManager.blockingCreatures.delete(this.object);
    }

    private canEdit(player: Player) {
        return !game.hasPendingPlayerInput && game.currentStepIndex === StepIndex.DeclareBlockers
            && player === game.declarationPlayer && player === this.object.controller;
    }
}
