import * as PIXI from "pixi.js";

import { Zone } from "@engine/Zone";
import UICard from "@ui/UICard";
import { pixi } from "@ui/UIRoot";

export class UIZone extends PIXI.Container<UICard> {
    constructor(public readonly zone: Zone) {
        super();
    }

    addCard(uiCard: UICard, origin?: PIXI.PointData) {
        this.addChild(uiCard);
        if (origin)
            this.toLocal(origin, null, uiCard.position);
        else
            uiCard.position.set(pixi.screen.width * 0.35, -200);
    }

    removeCard(uiCard: UICard) {
        uiCard.leaveZone();
        this.removeChild(uiCard);
    }

    animateExit(uiCard: UICard) {
        const { art } = uiCard;
        const ghost = new PIXI.Sprite(art.texture);
        ghost.anchor.set(0.5);
        ghost.position.copyFrom(art.getGlobalPosition());
        ghost.width = art.width;
        ghost.height = art.height;
        const transform = art.getGlobalTransform();
        ghost.rotation = Math.atan2(transform.b, transform.a);
        ghost.tint = 0xff8877;
        pixi.stage.addChild(ghost);
        let elapsed = 0;
        const dissolve = (ticker: PIXI.Ticker) => {
            elapsed += ticker.deltaMS;
            ghost.alpha = Math.max(0, 1 - elapsed / 450);
            ghost.y += ticker.deltaMS * 0.08;
            ghost.rotation += ticker.deltaMS * 0.001;
            if (elapsed >= 450) {
                pixi.ticker.remove(dissolve);
                ghost.destroy();
            }
        };
        pixi.ticker.add(dissolve);
    }
}
