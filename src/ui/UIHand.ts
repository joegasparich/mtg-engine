import * as PIXI from "pixi.js";

import {Hand} from "../engine/Zone";
import gameEventManager, {GameEventType} from "../engine/events/GameEventManager";
import {GameEvent_ChangeCardZone} from "../engine/events";
import UICard, {CARD_WIDTH} from "./UICard";
import Card from "../engine/Card";
import {autobind} from "../utility/typeUtility";
import {calculateCardPositionsRelativeToCenter} from "./drawUtility";
import {pixi} from "./UIRoot";

export class UIHand extends PIXI.Container {
    hand: Hand

    cardMap = new Map<Card, UICard>();

    constructor(hand: Hand) {
        super();

        this.hand = hand;

        gameEventManager.on(GameEventType.ChangeCardZone, this.onCardChangedZone)
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        if (event.newZone == this.hand)
            this.addCard(event.card);
        if (event.oldZone == this.hand)
            this.removeCard(event.card);
    }

    addCard(card: Card) {
        const uiCard = new UICard(card);
        this.addChild(uiCard);
        this.cardMap.set(card, uiCard);

        this.updatePositions();
    }

    removeCard(card: Card) {
        const uiCard = this.cardMap.get(card);
        this.removeChild(uiCard);
        this.cardMap.delete(card);

        this.updatePositions();
    }

    private updatePositions() {
        const positions = calculateCardPositionsRelativeToCenter(this.children.length, CARD_WIDTH + 30, pixi.screen.width * 0.67)
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].position.x = positions[i];
        }
    }
}