import * as PIXI from "pixi.js";

import {Battlefield} from "../engine/Zone";
import UICard from "./UICard";
import {UIZone} from "./UIZone";
import {pixi} from "./UIRoot";

export class UIBattlefield extends UIZone {
    battlefield: Battlefield;

    nextCardPos = 0;

    constructor(battlefield: Battlefield) {
        super(battlefield);

        this.battlefield = battlefield;
    }

    addCard(uiCard: UICard) {
        super.addCard(uiCard);

        uiCard.position = new PIXI.Point(this.nextCardPos, -pixi.screen.height/3 + this.nextCardPos);
        this.nextCardPos += 10;
    }
}