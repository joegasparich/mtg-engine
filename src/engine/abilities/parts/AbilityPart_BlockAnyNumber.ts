import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckBlockLimit } from "@engine/events/GameEvent_CardInteractionChecks";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_BlockAnyNumber extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: ({ events }) => {
                for (const event of events) {
                    if (event instanceof GameEvent_CheckBlockLimit && event.blocker === this.ability.source)
                        event.maxAttackers = Infinity;
                }
            },
        };
    }
}
