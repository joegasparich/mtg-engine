import { Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";

export class GameEvent_UntapCard extends GameEvent {
    type = GameEventType.UntapCard;

    permanent: Permanent;

    constructor(permanent: Permanent) {
        super();

        this.permanent = permanent;

        this.label = `Card ${this.permanent.logName} was untapped`;
    }

    perform(): boolean {
        if (!this.permanent.zone)
            return false;

        this.permanent.tapped = false;
        return true;
    }
}
