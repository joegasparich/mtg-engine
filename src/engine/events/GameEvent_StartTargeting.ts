import {GameEvent, GameEventType} from "@engine/events/GameEventManager";
import {Targeter} from "@engine/actions";

export class GameEvent_StartTargeting extends GameEvent {
    type = GameEventType.StartTargeting;

    label = "Start targeting";
    targeter: Targeter;

    constructor(targeter: Targeter) {
        super();

        this.targeter = targeter;
    }
}