import * as PIXI from "pixi.js";

import {Battlefield} from "../Zone";
import gameEventManager, {GameEventType} from "../GameEvents/GameEventManager";
import {GameEvent_ChangeCardZone} from "../GameEvents";
import UICard from "./UICard";
import Card from "../Card";
import {autobind} from "../typeUtility";

export class UIBattlefield extends PIXI.Container {
    battlefield: Battlefield

    cardMap = new Map<Card, UICard>();
    nextCardPos = 100;

    constructor(battlefield: Battlefield) {
        super();

        this.battlefield = battlefield;

        gameEventManager.on(GameEventType.ChangeCardZone, this.onCardChangedZone)
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        if (event.newZone == this.battlefield)
            this.addCard(event.card);
        if (event.oldZone == this.battlefield)
            this.removeCard(event.card);
    }

    addCard(card: Card) {
        const uiCard = new UICard(card);
        this.addChild(uiCard);
        this.cardMap.set(card, uiCard);

        uiCard.position = new PIXI.Point(this.nextCardPos, this.nextCardPos);
        this.nextCardPos += 10;
    }

    removeCard(card: Card) {
        const uiCard = this.cardMap.get(card);
        this.removeChild(uiCard);
        this.cardMap.delete(card);
    }
}