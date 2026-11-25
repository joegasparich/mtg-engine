import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckRequiredBlock } from "@engine/events/GameEvent_CardInteractionChecks";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_BlockEachAttacker extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: ({ events }) => {
                for (const event of events) {
                    if (event instanceof GameEvent_CheckRequiredBlock && event.blocker === this.ability.source)
                        event.required = true;
                }
            },
        };
    }
}
