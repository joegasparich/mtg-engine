import {activatedAbilitiesCosts} from "./workers";
import {PlayerAction, PlayerAction_ActivatedAbility, PlayerAction_PlayCard} from "./PlayerAction";
import {Battlefield, Hand, Library} from "./Zone";
import * as PIXI from "pixi.js";
import Card from "./Card";
import {cardData, pixi} from "./renderer";

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

    // Rendering
    container = new PIXI.Container()

    constructor(id: number, deck: number[], position: PIXI.Point, rotation: number) {
        this.id = id;
        this.library.cards = deck.map(i => {
            let card = new Card(cardData[i], id);
            card.zone = this.library;
            return card;
        });

        this.container.position = position;
        this.container.angle = rotation;

        this.container.addChild(this.battlefield.container);
        this.container.addChild(this.hand.container);
        this.hand.container.position = new PIXI.Point(0, pixi.screen.height/2 - 30);

        pixi.stage.addChild(this.container)
    }

    availableActions(): PlayerAction[] {
        const actions: PlayerAction[] = [];

        // Check hand for playable cards
        for (const card of this.hand.cards) {
            if (this.manaPool.canPay(card.cost) && card.canPlay())
                actions.push(new PlayerAction_PlayCard(card));
        }

        // Check permanents for activated abilities
        for (const card of this.battlefield.cards) {
            for (const abilityData of card.def.activated_abilities) {
                if (activatedAbilitiesCosts.get(abilityData.cost).payable(card, this.id))
                    actions.push(new PlayerAction_ActivatedAbility(abilityData, card));
            }
        }

        return actions;
    }

    performAction(action: PlayerAction) {
        action.perform(this.id);
    }
}