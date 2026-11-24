import { PlayerAction } from "@engine/actions/PlayerAction";
import { ActionTarget } from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { CombatManager } from "@engine/CombatManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";

export class PlayerAction_DeclareAttacker extends PlayerAction {
    targets: ActionTarget[];

    constructor(card: Card) {
        super(card);

        // this.targets = CombatManager.potentialAttackTargetsFor(attacker);
    }

    label() {
        return `Declare ${this.card.name} as an attacker`;
    }

    perform(player: Player, _targets?: ActionTarget[]) {
        if (game.currentStepIndex !== StepIndex.DeclareAttackers || player !== game.activePlayer()
            || player !== this.card.controller || !CombatManager.canAttack(this.card))
            return;

        CombatManager.attackingCreatures.set(this.card, game.randomOpponent(player));
    }
}
