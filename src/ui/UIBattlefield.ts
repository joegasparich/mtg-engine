import * as PIXI from 'pixi.js';

import UICard from "@ui/UICard";
import {UIZone} from "@ui/UIZone";
import {Battlefield} from "@engine/Zone";
import {pixi} from "@ui/UIRoot";

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