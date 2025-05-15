import Card from "../Card";
import Player from "../Player";
import {ActionTarget} from "./PlayerActionManager";

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