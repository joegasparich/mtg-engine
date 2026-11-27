import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { GameEvent_StepStart } from "@engine/events/GameEvent_Step";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { StepIndex } from "@engine/Step";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_NextStep extends AbilityPart_Trigger {
    inSignal: string;
    step: keyof typeof StepIndex;

    onSignalFired(signal: string) {
        if (signal !== this.inSignal) return;

        // 603.7a–b, 603.7d: Resolution creates a one-time trigger controlled by the spell's controller.
        const controller = this.ability.controller ?? this.ability.source.controller;
        gameEventManager.onGamePerformed<GameEvent_StepStart>(GameEventType.StepStart,
            () => this.onTrigger({}, controller), { once: true, matches: event => event.stepIndex === StepIndex[this.step] });
    }
}
