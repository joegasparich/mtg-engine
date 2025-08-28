import {GameEvent, GameEventType} from "@engine/events/GameEventManager";
import Card from "@engine/Card";

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