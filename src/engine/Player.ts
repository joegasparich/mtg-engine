import {PlayerAction} from "./PlayerAction";
import {Battlefield, Hand, Library} from "./Zone";
import Card from "./Card";
import {cardData} from "./root";

export enum ManaColour {
    W, U, B, R, G, C
}

class ManaPool {
    // W U B R G Colourless Any
    pool = [0, 0, 0, 0, 0, 0];

    canPay(cost: number[]): boolean {
        return this.pay(cost, [...this.pool]);
    }

    // This picks the colours for the player prioritising colourless
    pay(cost: number[], pool: number[] = this.pool): boolean {
        if (!cost)
            return true;

        // WUBRG + specifically colourless
        for (let i = 0; i < 6; i++) {
            if (pool[i] < cost[i])
                return false;

            pool[i] -= cost[i];
        }

        // Any, prioritising colourless
        let any = cost[6];
        for (let i = 5; i >= 0; i--) {
            if (pool[i] > 0) {
                var diff = Math.min(any, pool[i]);
                any -= diff;
                pool[i] -= diff;
            }

            if (any <= 0)
                return true;
        }
    }
}


export default class Player {
    id: number;

    life: 20;
    manaPool = new ManaPool();

    library: Library = new Library();
    hand: Hand = new Hand();
    battlefield: Battlefield = new Battlefield();
    // graveyard: Card[] = [];
    // exile: Card[] = [];

    constructor(id: number, deck: number[]) {
        this.id = id;
        this.library.cards = deck.map(i => {
            let card = new Card(cardData[i], this);
            card.zone = this.library;
            return card;
        });
    }

    getActions(): PlayerAction[] {
        const actions: PlayerAction[] = [];

        for (const card of this.hand.cards) {
            actions.push(...card.getActions(this));
        }

        for (const card of this.battlefield.cards) {
            actions.push(...card.getActions(this));
        }

        return actions;
    }

    performAction(action: PlayerAction) {
        action.perform(this);
    }
}