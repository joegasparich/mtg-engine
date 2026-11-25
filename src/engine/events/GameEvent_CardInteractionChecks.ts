import type { CardObject,Permanent } from "@engine/GameObject";
import { GameEvent,GameEventType } from "./GameEventManager";

export class GameEvent_CheckTarget extends GameEvent {
    type = GameEventType.CheckTarget;
    label = "";

    constructor(readonly source: CardObject, readonly target: CardObject) {
        super();
    }
}

export class GameEvent_CheckAttachment extends GameEvent {
    type = GameEventType.CheckAttachment;
    label = "";

    constructor(readonly attachment: CardObject, readonly recipient: Permanent) {
        super();
    }
}

export class GameEvent_DeclareAttacker extends GameEvent {
    type = GameEventType.DeclareAttacker;
    label = "";

    constructor(readonly attacker: Permanent) {
        super();
    }
}

export class GameEvent_DeclareBlocker extends GameEvent {
    type = GameEventType.DeclareBlocker;
    label = "";

    constructor(readonly blocker: Permanent, readonly attacker: Permanent) {
        super();
    }
}
