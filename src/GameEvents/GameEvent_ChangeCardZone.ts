import Card from "../Card";
import {Zone} from "../Zone";
import {GameEvent, GameEventType} from "./GameEventManager";

export default class GameEvent_ChangeCardZone extends GameEvent {
    type = GameEventType.ChangeCardZone;

    card: Card;
    newZone: Zone;

    constructor(card: Card, newZone: Zone) {
        super();

        this.card = card;
        this.newZone = newZone

        this.label = `Card ${this.card?.def?.name} changed zones from ${this.card.zone?.name} to ${this.newZone?.name}`;
    }

    perform() {
        this.card.zone?.onLeave(this.card);
        this.card.zone = this.newZone;
        this.newZone.onEnter(this.card);
    }
}