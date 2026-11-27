import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckStep } from "@engine/events/GameEvent_Step";
import { StepIndex } from "@engine/Step";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_SkipStep extends AbilityPart_ContinuousEffect {
    step: keyof typeof StepIndex;

    protected getContinuousEffect(): ContinuousEffect {
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_CheckStep
                && event.stepIndex === StepIndex[this.step]),
        };
    }
}
