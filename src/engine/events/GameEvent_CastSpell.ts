import type { ActionTarget } from "@engine/actions";
import { CardObject } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    handObject: CardObject;

    constructor(caster: Player, handObject: CardObject, readonly targets: readonly ActionTarget[] = []) {
        super();

        this.caster = caster;
        this.handObject = handObject;

        this.label = `Player ${this.caster.id} cast ${this.handObject.logName}`;
    }

    perform(): boolean {
        if (game.pendingTargeter || !game.stack.spellCast(this.caster, this.handObject, this.targets))
            return false;

        // TODO: Pass priority to the next player
        game.stack.resolveAll();
        return true;
    }
}
