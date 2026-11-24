import Card from "@engine/Card";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    card: Card;

    constructor(caster: Player, card: Card) {
        super();

        this.caster = caster;
        this.card = card;

        this.label = `Player ${this.caster.id} cast ${this.card.logName}`;
    }

    perform() {
        game.stack.spellCast(this.caster, this.card);

        // TODO: Pass priority to the next player

        gameEventManager.onResolved(() => {
            game.stack.resolveAll();
        });
    }
}