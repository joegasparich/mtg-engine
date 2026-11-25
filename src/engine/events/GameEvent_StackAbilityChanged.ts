import type { StackAbility } from "@engine/GameObject";
import { GameEvent,GameEventType } from "./GameEventManager";

export class GameEvent_StackAbilityChanged extends GameEvent {
    type = GameEventType.StackAbilityChanged;
    isAction = false;
    label: string;

    constructor(readonly ability: StackAbility, readonly onStack: boolean) {
        super();
        const change = onStack ? "entered" : "left";
        this.label = `${ability.source.name}'s ability ${change} the stack`;
    }
}
