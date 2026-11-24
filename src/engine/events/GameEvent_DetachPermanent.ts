import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";

export class GameEvent_DetachPermanent extends GameEvent {
    type = GameEventType.DetachPermanent;

    constructor(readonly permanent: Permanent) {
        super();
        this.label = `Permanent ${permanent.logName} became unattached`;
    }

    perform(): boolean {
        if (!(this.permanent.zone instanceof Battlefield) || !this.permanent.attachedTo)
            return false;
        this.permanent.attachedTo = undefined;
        return true;
    }
}
