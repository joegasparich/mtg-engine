import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";

export class GameEvent_AttachPermanent extends GameEvent {
    type = GameEventType.AttachPermanent;

    constructor(readonly permanent: Permanent, readonly target: Permanent) {
        super();
        this.label = `${permanent.logName} attached to ${target.logName}`;
    }

    perform(): boolean {
        // 701.3a–b: An illegal attachment or reattachment to the same object does nothing.
        if (!(this.permanent.zone instanceof Battlefield) || this.permanent.attachedTo === this.target
            || !this.permanent.canAttachTo(this.target))
            return false;

        this.permanent.attachedTo = this.target;
        return true;
    }
}
