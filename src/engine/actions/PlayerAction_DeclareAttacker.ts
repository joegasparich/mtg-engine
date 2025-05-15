import Card from "../Card";
import {CombatManager} from "../CombatManager";
import Player from "../Player";
import {ActionTarget, PlayerAction} from "./PlayerAction";
import {game} from "../Game";

export class PlayerAction_DeclareAttacker implements PlayerAction {
    creature: Card;
    targets: ActionTarget[];

    constructor(attacker: Card) {
        this.creature = attacker;

        // this.targets = CombatManager.potentialAttackTargetsFor(attacker);
    }

    label() {
        return `Declare ${this.creature.name} as an attacker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        // if (!targets?.length) {
        //     console.error("Performed declare attacker without a target");
        //     return;
        // }
        //
        // // TODO: Target player or planeswalker
        // const target = targets[0] as Player;

        CombatManager.attackingCreatures.set(this.creature, game.randomOpponent(player));
    }
}