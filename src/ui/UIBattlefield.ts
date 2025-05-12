import * as PIXI from "pixi.js";

import {Battlefield} from "../engine/Zone";
import UICard from "./UICard";
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