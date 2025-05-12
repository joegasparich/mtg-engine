import * as PIXI from "pixi.js";
import {Zone} from "../engine/Zone";
import gameEventManager, {GameEventType} from "../engine/events/GameEventManager";
import {autobind} from "../utility/typeUtility";
import {GameEvent_ChangeCardZone} from "../engine/events";
import UICard from "./UICard";
import {uiRoot} from "./UIRoot";

export class UIZone extends PIXI.Container {
    zone: Zone;

    constructor(zone: Zone) {
        super();

        this.zone = zone;

        gameEventManager.on(GameEventType.ChangeCardZone, this.onCardChangedZone)
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        let uiCard;
        if (!uiRoot.cardToUICard.has(event.card)) {
            uiCard = new UICard(event.card);
        } else {
            uiCard = uiRoot.cardToUICard.get(event.card);
        }

        if (event.newZone == this.zone)
            this.addCard(uiCard);
        if (event.oldZone == this.zone)
            this.removeCard(uiCard);
    }

    addCard(uiCard: UICard) {
        this.addChild(uiCard);
    }

    removeCard(uiCard: UICard) {
        this.removeChild(uiCard);
    }
}