import Card from "../Card";
import {CombatManager} from "../CombatManager";
import Player from "../Player";
import {ActionTarget} from "./PlayerActionManager";
import {game} from "../Game";
import {PlayerAction} from "./PlayerAction";

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