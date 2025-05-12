import {Hand} from "../engine/Zone";
import UICard, {CARD_WIDTH} from "./UICard";
import {calculateCardPositionsRelativeToCenter} from "./drawUtility";
import {pixi} from "./UIRoot";
import {UIZone} from "./UIZone";


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