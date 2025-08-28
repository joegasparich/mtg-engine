import gameEventManager, {GameEvent, GameEventType} from "./GameEventManager";
import Player from "../Player";
import {GameEvent_ChangeCardZone} from "./GameEvent_ChangeCardZone";

export class GameEvent_DrawCard extends GameEvent {
    type = GameEventType.DrawCard;

    player: Player;
    count: number;

    constructor(player: Player, count = 1) {
        super();

        this.player = player;
        this.count = count;

        this.label = `Player ${this.player.id} drawing card from library`;
    }

    perform() {
        const cards = this.player.library.getTopXCards(this.count);
        for (const card of cards) {
            this.label = `Player ${this.player.id} drew ${card.logName} from library`;

            gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, this.player.hand));
        }
    }
}