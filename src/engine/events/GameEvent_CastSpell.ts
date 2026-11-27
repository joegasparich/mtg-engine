import type { ActionTarget } from "@engine/actions";
import { CardObject } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    handObject: CardObject;

    constructor(caster: Player, handObject: CardObject, readonly targets: readonly ActionTarget[] = [],
        readonly chosenX = 0, readonly chosenMode?: number) {
        super();

        this.caster = caster;
        this.handObject = handObject;

        const variableCost = handObject.variableManaSymbols ? ` with X = ${chosenX}` : "";
        this.label = `Player ${this.caster.id} cast ${this.handObject.logName}${variableCost}`;
    }

    perform(): boolean {
        if (this.handObject.owner !== this.caster || !this.handObject.withCastingX(this.chosenX, () => this.handObject.canPlay())
            || !game.stack.spellCast(this.caster, this.handObject, this.targets, this.chosenX, this.chosenMode))
            return false;

        game.notePriorityAction();
        return true;
    }
}
