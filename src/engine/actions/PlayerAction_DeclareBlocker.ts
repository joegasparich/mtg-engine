import Card from "../Card";
import {CombatManager} from "../CombatManager";
import Player from "../Player";
import {ActionTarget} from "./PlayerActionManager";
import {PlayerAction} from "./PlayerAction";

export class PlayerAction_DeclareBlocker extends PlayerAction {
    constructor(card: Card) {
        super(card);

        this.targets = CombatManager.potentialBlockTargetsFor(card);
    }

    label() {
        return `Declare ${this.card.name} as a blocker`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        if (!targets?.length) {
            console.error("Performed declare blocker without a target");
            return;
        }

        const target = targets[0] as Card;

        CombatManager.blockingCreatures.set(this.card, target);
    }
}