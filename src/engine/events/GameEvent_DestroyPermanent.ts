import {GameEvent, GameEventType} from "@engine/events/GameEventManager";
import Card from "@engine/Card";

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