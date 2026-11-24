import type { PointData } from "pixi.js";

import { Battlefield } from "@engine/Zone";
import UICard from "@ui/UICard";
import { pixi } from "@ui/UIRoot";
import { UIZone } from "@ui/UIZone";

export class UIBattlefield extends UIZone {
    constructor(battlefield: Battlefield) {
        super(battlefield);
    }

    containsDrop(point: PointData) {
        const local = this.toLocal(point);
        return pixi.screen.contains(point.x, point.y)
            && local.y <= -150
            && local.y >= -pixi.screen.height / 2;
    }

    placeCard(uiCard: UICard, point: PointData) {
        const local = this.toLocal(point);
        uiCard.layout(local.x, local.y);
    }

    addCard(uiCard: UICard, origin?: PointData) {
        const drop = uiCard.battlefieldDrop;
        uiCard.battlefieldDrop = undefined;
        super.addCard(uiCard, drop ?? origin);
        if (drop) {
            this.placeCard(uiCard, drop);
            return;
        }

        const index = this.children.length - 1;
        uiCard.layout((index % 6 - 2.5) * 145, -pixi.screen.height / 3 - Math.floor(index / 6) * 190);
    }
}
