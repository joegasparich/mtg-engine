import { Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { type RecordRulesEvent,RulesEventType } from "./RulesEvent";

// CR 603.2e, 701.26a: Only an untapped permanent can become tapped.
export function tapPermanent(permanent: Permanent, record: RecordRulesEvent) {
    if (permanent.tapped) return;
    permanent.tapped = true;
    record({ type: RulesEventType.BecomesTapped, permanent });
}

export class GameEvent_TapCard extends GameEvent {
    type = GameEventType.TapCard;

    constructor(readonly permanent: Permanent) {
        super();
        this.label = `Card ${this.permanent.logName} was tapped`;
    }

    perform(record: RecordRulesEvent): boolean {
        if (!this.permanent.zone)
            return false;

        tapPermanent(this.permanent, record);
        return true;
    }
}

// 508.1f: Tapping a declared attacker is a turn-based action.
export class GameEvent_TapAttacker extends GameEvent_TapCard {}
