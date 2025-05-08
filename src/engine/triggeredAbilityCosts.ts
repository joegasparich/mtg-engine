import {ActivatedAbilityCostType} from "../defs";
import Card from "./Card";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_TapCard} from "./events";

export interface ActivatedAbilityCostWorker {
    type: ActivatedAbilityCostType;

    payable: (card: Card, activatorID: number) => boolean;
    pay: (card: Card, activatorID: number) => void;
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

    payable(card: Card, activatorID: number): boolean {
        if (card.controllerID != activatorID)
            return false; // Card not under our control

        return !card.Tapped();
    }
    pay(card: Card, activatorID: number): void {
        gameEventManager.addEvent(new GameEvent_TapCard(card))
    }
}