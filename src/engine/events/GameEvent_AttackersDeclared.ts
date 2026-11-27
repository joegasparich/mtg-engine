import { game } from "@engine/Game";
import type { Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import { GameEvent,GameEventType } from "./GameEventManager";
import { type RecordRulesEvent,RulesEventType } from "./RulesEvent";

export class GameEvent_AttackersDeclared extends GameEvent {
    type = GameEventType.AttackersDeclared;
    label = "Attackers declared";

    constructor(readonly attacks: ReadonlyMap<Permanent, Player>) {
        super();
    }

    perform(record: RecordRulesEvent): boolean {
        // 508.1k–m: Only the creatures in the completed declaration have attacked.
        for (const [attacker, defender] of this.attacks) {
            attacker.lastAttackedTurn = game.turnNumber;
            record({ type: RulesEventType.Attacks, attacker, defender });
        }
        return true;
    }
}
