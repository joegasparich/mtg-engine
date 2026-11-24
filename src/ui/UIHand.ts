import type { PointData } from "pixi.js";

import { Hand } from "@engine/Zone";
import UICard,{ CARD_HEIGHT,CARD_WIDTH } from "@ui/UICard";
import { pixi } from "@ui/UIRoot";
import { UIZone } from "@ui/UIZone";

const FAN_RADIUS = 1550;
const MAX_CARD_SPACING = 64;
const MAX_FAN_ANGLE = 0.20; // Radians from the center of the hand to either end.

export class UIHand extends UIZone {
    constructor(hand: Hand) {
        super(hand);
    }

    addCard(uiCard: UICard, origin?: PointData) {
        super.addCard(uiCard, origin);
        this.updatePositions();
    }

    removeCard(uiCard: UICard) {
        super.removeCard(uiCard);
        this.updatePositions();
    }

    updatePositions() {
        const halfCount = Math.max(0, (this.children.length - 1) / 2);
        const halfWidth = Math.max(0, (pixi.screen.width * 0.67 - CARD_WIDTH) / 2);
        const halfAngle = Math.min(
            Math.asin(Math.min(1, halfWidth / FAN_RADIUS)),
            MAX_FAN_ANGLE,
            halfCount * MAX_CARD_SPACING / FAN_RADIUS
        );

        const edgeDrop = FAN_RADIUS * (1 - Math.cos(halfAngle));
        const edgeHalfHeight = (CARD_HEIGHT * Math.cos(halfAngle) + CARD_WIDTH * Math.sin(halfAngle)) / 2;
        const centerY = -Math.max(CARD_HEIGHT / 2 + 24, edgeDrop + edgeHalfHeight + 8);

        this.children.forEach((view, index) => {
            const angle = halfCount > 0 ? (index - halfCount) / halfCount * halfAngle : 0;
            const x = FAN_RADIUS * Math.sin(angle);
            const y = centerY + FAN_RADIUS * (1 - Math.cos(angle));
            view.layout(x, y, angle * 180 / Math.PI);
        });
    }
}
