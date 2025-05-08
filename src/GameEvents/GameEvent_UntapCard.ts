import Card from "../Card";
import {GameEvent, GameEventType} from "./GameEventManager";

export default class GameEvent_UntapCard extends GameEvent {
    type = GameEventType.UntapCard;

    card: Card;

    constructor(card: Card) {
        super();

        this.card = card;

        this.label = `Card ${this.card?.def?.name} was untapped`;
    }

    perform() {
        this.card.tapped = false;
    }
}