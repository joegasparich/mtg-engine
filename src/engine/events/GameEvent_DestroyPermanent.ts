import Card from "../Card";
import {GameEvent, GameEventType} from "./GameEventManager";

export class GameEvent_DestroyPermanent extends GameEvent {
    card: Card;

    constructor(card: Card) {
        super();

        this.type = GameEventType.DestroyPermanent;
        this.label = `Permanent ${card.logName} destroyed`;
        this.card = card;
    }

    perform() {
        this.card.destroy();
    }
}