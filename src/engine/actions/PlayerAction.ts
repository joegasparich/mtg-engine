import {ActionTarget} from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import Player from "@engine/Player";

export abstract class PlayerAction {
    card: Card;
    targets: ActionTarget[] | null;

    constructor(card: Card) {
        this.card = card;
    }

    label(): string {
        return "";
    }

    perform(owner: Player, targets?: ActionTarget[]): void {
    }
}