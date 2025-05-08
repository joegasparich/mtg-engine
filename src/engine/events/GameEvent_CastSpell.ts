import { GameEvent_ChangeCardZone } from "./index";
import Card from "../Card";
import gameEventManager, {GameEvent, GameEventType} from "./GameEventManager";
import {game} from "../root";
import Player from "../Player";

export default class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    card: Card;

    constructor(caster: Player, card: Card) {
        super();

        this.caster = caster;
        this.card = card;

        this.label = `Player ${this.caster.id} cast ${this.card.def.name}`;
    }

    perform() {
        const changeZone = new GameEvent_ChangeCardZone(this.card, game.stack);
        changeZone.then(() => {
            game.stack.resolveAll();
        })

        gameEventManager.addEvent(changeZone);
    }
}