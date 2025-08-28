import {PlayerAction} from "@engine/actions/PlayerAction";
import Card from "@engine/Card";
import {CombatManager} from "@engine/CombatManager";
import Player from "@engine/Player";
import {ActionTarget} from "@engine/actions/PlayerActionManager";

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