import * as PIXI from "pixi.js";

import {Battlefield} from "../engine/Zone";
import gameEventManager, {GameEventType} from "../engine/events/GameEventManager";
import {GameEvent_ChangeCardZone} from "../engine/events";
import UICard from "./UICard";
import Card from "../engine/Card";
import {autobind} from "../utility/typeUtility";
import {UIZone} from "./UIZone";

export class UIBattlefield extends UIZone {
    battlefield: Battlefield

    nextCardPos = 100;

    constructor(battlefield: Battlefield) {
        super(battlefield);

        this.battlefield = battlefield;
    }

    addCard(uiCard: UICard) {
        super.addCard(uiCard);

        uiCard.position = new PIXI.Point(this.nextCardPos, this.nextCardPos);
        this.nextCardPos += 10;
    }
}