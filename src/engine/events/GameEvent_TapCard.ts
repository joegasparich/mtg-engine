import { Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";

export class GameEvent_TapCard extends GameEvent {
    type = GameEventType.TapCard;

    permanent: Permanent;

    constructor(permanent: Permanent) {
        super();

        this.permanent = permanent;

        this.label = `Card ${this.permanent.logName} was tapped`;
    }

    perform(): boolean {
        if (!this.permanent.zone)
            return false;

        this.permanent.tapped = true;
        return true;
    }
}
