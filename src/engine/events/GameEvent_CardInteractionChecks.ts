import type { Ability } from "@engine/abilities";
import type { CardObject,Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { CardType } from "~/defs";
import gameEventManager,{ GameEvent,GameEventType } from "./GameEventManager";

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

export interface CardCharacteristics {
    types: readonly CardType[];
    subtypes: readonly string[];
    basePower: number;
    baseToughness: number;
    nativeAbilities: readonly Ability[];
}

export class GameEvent_CheckCharacteristics extends GameEvent {
    type = GameEventType.CheckCharacteristics;
    label = "";

    private static readonly reads = new Map<CardObject, CardCharacteristics>();

    // A live slate selection can read several permanents, including the one being checked.
    // Reuse their snapshots within this evaluation only, then discard them together.
    static evaluate(object: CardObject, base: CardCharacteristics): Readonly<CardCharacteristics> {
        const current = this.reads.get(object);
        if (current)
            return current;

        const outermost = !this.reads.size;
        this.reads.set(object, base);
        try {
            gameEventManager.checkEvent(new GameEvent_CheckCharacteristics(object, base));
            return base;
        } finally {
            if (outermost)
                this.reads.clear();
        }
    }

    private constructor(readonly object: CardObject, readonly characteristics: CardCharacteristics) {
        super();
    }
}

export class GameEvent_CheckPowerToughness extends GameEvent {
    type = GameEventType.CheckPowerToughness;
    label = "";
    power: number;
    toughness: number;

    constructor(readonly permanent: Permanent, readonly characteristics: Readonly<CardCharacteristics>) {
        super();
        // 613.4b–c: Start the modifier pass with the resolved base power and toughness.
        this.power = characteristics.basePower;
        this.toughness = characteristics.baseToughness;
    }
}
