import {PlayerAction} from "@engine/actions/PlayerAction";
import {ActionTarget} from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import Player from "@engine/Player";
import {CombatManager} from "@engine/CombatManager";
import {game} from "@engine/Game";

export class PlayerAction_DeclareAttacker extends PlayerAction {
    targets: ActionTarget[];

    constructor(card: Card) {
        super(card);

        // this.targets = CombatManager.potentialAttackTargetsFor(attacker);
    }

    label() {
        return `Declare ${this.card.name} as an attacker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        // if (!targets?.length) {
        //     console.error("Performed declare attacker without a target");
        //     return;
        // }
        //
        // // TODO: Target player or planeswalker
        // const target = targets[0] as Player;

        CombatManager.attackingCreatures.set(this.card, game.randomOpponent(player));
    }
}