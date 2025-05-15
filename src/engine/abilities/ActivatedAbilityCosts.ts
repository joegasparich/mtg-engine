import Card from "../Card";
import gameEventManager from "../events/GameEventManager";
import Player from "../Player";
import {GameEvent_TapCard} from "../events";

export interface ActivatedAbilityCost {
    label: string;
    payable: (card: Card, activator: Player) => boolean;
    pay: (card: Card, activator: Player) => void;
}

export const ActivatedAbilityCosts = {
    instanceMap: new Map<string, ActivatedAbilityCost>(),
    get(type: string): ActivatedAbilityCost {
        if (!this.instanceMap.has(type)) {
            this.instanceMap.set(type, new this[type]);
        }

        return this.instanceMap.get(type);
    },

    ActivatedAbilityCost_Tap: class implements ActivatedAbilityCost {
        label = "Tap";

        payable(card: Card, activator: Player): boolean {
            return !card.tapped;
        }
        pay(card: Card, activator: Player): void {
            gameEventManager.addEvent(new GameEvent_TapCard(card));
        }
    }
};
