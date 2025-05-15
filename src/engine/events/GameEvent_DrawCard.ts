import gameEventManager, {GameEvent, GameEventType} from "./GameEventManager";
import Player from "../Player";
import {GameEvent_ChangeCardZone} from "./GameEvent_ChangeCardZone";

export class GameEvent_DrawCard extends GameEvent {
    type = GameEventType.DrawCard;

    player: Player;

    constructor(player: Player) {
        super();

        this.player = player;

        this.label = `Player ${this.player.id} drawing card from library`;
    }

    perform() {
        const card = this.player.library.getTopCard();

        this.label = `Player ${this.player.id} drew ${card.logName} from library`;

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, this.player.hand));
    }
}