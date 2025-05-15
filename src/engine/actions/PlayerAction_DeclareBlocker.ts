import Card from "../Card";
import {CombatManager} from "../CombatManager";
import Player from "../Player";
import {ActionTarget, PlayerAction} from "./PlayerAction";

export class PlayerAction_DeclareBlocker implements PlayerAction {
    creature: Card;
    targets: ActionTarget[];

    constructor(blocker: Card) {
        this.creature = blocker;

        this.targets = CombatManager.potentialBlockTargetsFor(blocker);
    }

    label() {
        return `Declare ${this.creature.name} as a blocker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        if (!targets?.length) {
            console.error("Performed declare blocker without a target");
            return;
        }

        const target = targets[0] as Card;

        CombatManager.blockingCreatures.set(this.creature, target);
    }
}