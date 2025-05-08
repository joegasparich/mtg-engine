import {ActivatedAbilityCostType} from "../defs";
import Card from "./Card";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_TapCard} from "./events";
import Player from "./Player";

export interface ActivatedAbilityCostWorker {
    type: ActivatedAbilityCostType;

    payable: (card: Card, activator: Player) => boolean;
    pay: (card: Card, activator: Player) => void;
}
export namespace ActivatedAbilityCostWorker {
    type Constructor<T> = {
        new(...args: any[]): T;
        readonly prototype: T;
    }
    const implementations: Constructor<ActivatedAbilityCostWorker>[] = [];
    export function GetImplementations(): Constructor<ActivatedAbilityCostWorker>[] {
        return implementations;
    }
    export function register<T extends Constructor<ActivatedAbilityCostWorker>>(ctor: T) {
        implementations.push(ctor);
        return ctor;
    }
}

@ActivatedAbilityCostWorker.register
class ActivatedAbilityCostWorker_Tap {
    type = ActivatedAbilityCostType.Tap;

    payable(card: Card, activator: Player): boolean {
        if (card.controller != activator)
            return false; // Card not under our control

        return !card.Tapped();
    }
    pay(card: Card, activator: Player): void {
        gameEventManager.addEvent(new GameEvent_TapCard(card))
    }
}