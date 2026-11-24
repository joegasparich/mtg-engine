import Card from "@engine/Card";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";

export class GameEvent_UntapCard extends GameEvent {
    type = GameEventType.UntapCard;

    card: Card;

    constructor(card: Card) {
        super();

        this.card = card;

        this.label = `Card ${this.card.logName} was untapped`;
    }

    perform() {
        this.card.tapped = false;
    }
}