import * as PIXI from "pixi.js";

import { Zone } from "@engine/Zone";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import UICard from "@ui/UICard";
import { uiRoot } from "@ui/UIRoot";
import { autobind } from "@utility/typeUtility";

export class UIZone extends PIXI.Container {
    zone: Zone;

    constructor(zone: Zone) {
        super();

        this.zone = zone;

        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
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