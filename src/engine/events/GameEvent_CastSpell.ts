import type { ActionTarget } from "@engine/actions";
import Card from "@engine/Card";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    card: Card;

    constructor(caster: Player, card: Card, readonly targets: readonly ActionTarget[] = []) {
        super();

        this.caster = caster;
        this.card = card;

        this.label = `Player ${this.caster.id} cast ${this.card.logName}`;
    }

    perform(): boolean {
        if (game.pendingTargeter || !game.stack.spellCast(this.caster, this.card, this.targets))
            return false;

        // TODO: Pass priority to the next player

        gameEventManager.onResolved(() => {
            game.stack.resolveAll();
        });
        return true;
    }
}
