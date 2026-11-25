import type { Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import { GameEvent,GameEventType } from "./GameEventManager";

export type CombatDamageAssignment = {
    readonly player: Player;
    readonly source: Permanent;
    readonly recipients: readonly Permanent[];
    readonly total: number;
};

export type CombatDamageChoice = CombatDamageAssignment & {
    submit(player: Player, amounts: readonly number[]): void;
};

export class GameEvent_CheckCombatDamageChooser extends GameEvent {
    type = GameEventType.CheckCombatDamageChooser;
    player: Player;

    constructor(readonly source: Permanent, readonly recipients: readonly Permanent[]) {
        super();
        this.player = source.controller;
    }
}

export class GameEvent_RequestCombatDamageChoice extends GameEvent {
    type = GameEventType.RequestCombatDamageChoice;

    constructor(readonly choice: CombatDamageChoice) {
        super();
        this.label = `Player ${choice.player.id} must assign combat damage from ${choice.source.logName}`;
    }
}

export class GameEvent_SubmitCombatDamageChoice extends GameEvent {
    type = GameEventType.SubmitCombatDamageChoice;

    constructor(readonly choice: CombatDamageChoice, private readonly accept: () => boolean) {
        super();
        this.label = `Player ${choice.player.id} assigned combat damage from ${choice.source.logName}`;
    }

    perform(): boolean {
        return this.accept();
    }
}
