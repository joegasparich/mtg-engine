import type { CardObject,Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { BasicLandType } from "~/defs";
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

    constructor(readonly attacker: Permanent, readonly defender: Player | null = null) {
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

export class GameEvent_CheckBlockLimit extends GameEvent {
    type = GameEventType.CheckBlockLimit;
    label = "";
    maxAttackers = 1;

    constructor(readonly blocker: Permanent) {
        super();
    }
}

export class GameEvent_CheckRequiredBlock extends GameEvent {
    type = GameEventType.CheckRequiredBlock;
    label = "";
    required = false;

    constructor(readonly blocker: Permanent, readonly attacker: Permanent) {
        super();
    }
}

export class GameEvent_CheckBasicLandType extends GameEvent {
    type = GameEventType.CheckBasicLandType;
    label = "";
    replacement?: BasicLandType;

    constructor(readonly land: CardObject) {
        super();
    }
}
