import { Targeter } from "@engine/actions";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";

export class GameEvent_StartTargeting extends GameEvent {
    type = GameEventType.StartTargeting;

    label = "Start targeting";
    targeter: Targeter;

    constructor(targeter: Targeter) {
        super();

        this.targeter = targeter;
    }
}