import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Player from "@engine/Player";

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

    perform(): boolean {
        const objects = this.player.library.getTopXCards(this.count);
        for (const object of objects) {
            this.label = `Player ${this.player.id} drew ${object.logName} from library`;

            gameEventManager.addEvent(new GameEvent_ChangeCardZone(object, this.player.hand));
        }
        return objects.length > 0;
    }
}
