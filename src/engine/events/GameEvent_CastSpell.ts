import { GameEvent_ChangeCardZone } from "./index";
import Card from "../Card";
import gameEventManager, {GameEvent, GameEventType} from "./GameEventManager";
import {game} from "../root";

export default class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    casterID: number;
    card: Card;

    constructor(casterID: number, card: Card) {
        super();

        this.casterID = casterID;
        this.card = card;

        this.label = `Player ${this.casterID} cast ${this.card.def.name}`;
    }

    perform() {
        const changeZone = new GameEvent_ChangeCardZone(this.card, game.stack);
        changeZone.then(() => {
            game.stack.resolveAll();
        })

        gameEventManager.addEvent(changeZone);
    }
}