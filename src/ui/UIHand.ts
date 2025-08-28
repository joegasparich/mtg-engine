import {calculateCardPositionsRelativeToCenter} from "@ui/drawUtility";
import {UIZone} from "@ui/UIZone";
import {Hand} from "@engine/Zone";
import UICard, {CARD_WIDTH} from "@ui/UICard";
import {pixi} from "@ui/UIRoot";

export class UIHand extends UIZone {
    hand: Hand;

    constructor(hand: Hand) {
        super(hand);

        this.hand = hand;
    }

    addCard(uiCard: UICard) {
        super.addCard(uiCard);

        this.updatePositions();
    }

    removeCard(uiCard: UICard) {
        super.removeCard(uiCard);

        this.updatePositions();
    }

    private updatePositions() {
        const positions = calculateCardPositionsRelativeToCenter(this.children.length, CARD_WIDTH + 30, pixi.screen.width * 0.67)
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].position.x = positions[i];
        }
    }
}