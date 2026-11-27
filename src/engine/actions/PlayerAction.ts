import { ActionTarget } from "@engine/actions/PlayerActionManager";
import { CardObject } from "@engine/GameObject";
import Player from "@engine/Player";

export abstract class PlayerAction<T extends CardObject = CardObject> {
    object: T;
    targets: ActionTarget[] | null;

    constructor(object: T) {
        this.object = object;
    }

    label(): string {
        return "";
    }

    abstract perform(owner: Player, targets?: ActionTarget[]): void;
}