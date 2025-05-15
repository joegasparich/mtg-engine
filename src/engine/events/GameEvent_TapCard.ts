import Card from "../Card";
import {GameEvent, GameEventType} from "./GameEventManager";

export class GameEvent_TapCard extends GameEvent {
    type = GameEventType.TapCard;

    card: Card;

    constructor(card: Card) {
        super();

        this.card = card;

        this.label = `Card ${this.card.logName} was tapped`;
    }

    perform() {
        this.card.tapped = true;
    }
}