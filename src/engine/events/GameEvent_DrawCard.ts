import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Player from "@engine/Player";

export class GameEvent_DrawCard extends GameEvent {
    type = GameEventType.DrawCard;

    constructor(readonly player: Player) {
        super();
        this.label = `Player ${this.player.id} drawing card from library`;
    }

    perform(): boolean {
        // 121.1: Read the top card when this individual draw happens.
        const top = this.player.library.getTopCard();
        if (!top)
            return false;

        const move = new GameEvent_ChangeCardZone(top, this.player.hand);
        move.effect = this.effect;
        this.label = `Player ${this.player.id} drew ${top.logName} from library`;
        return gameEventManager.performImmediate(move);
    }
}

export class GameEvent_DrawCards extends GameEvent {
    type = GameEventType.DrawCards;

    constructor(readonly player: Player, readonly count: number) {
        super();
        this.label = `Player ${player.id} instructed to draw ${count} cards`;
    }

    perform(): boolean {
        if (!Number.isInteger(this.count) || this.count <= 0)
            return false;

        // 121.2–121.2a: Check the whole instruction first, then check each draw separately.
        let remaining = this.count;
        const drawNext = () => {
            const draw = new GameEvent_DrawCard(this.player);
            draw.effect = this.effect;
            gameEventManager.performImmediate(draw);

            // Finish this draw and its follow-ups before beginning the next one.
            if (--remaining > 0)
                gameEventManager.continueResolution(drawNext);
        };
        gameEventManager.continueResolution(drawNext);
        return true;
    }
}
