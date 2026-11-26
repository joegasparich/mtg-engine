import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_TapAttacker } from "@engine/events/GameEvent_TapCard";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Vigilance extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        // 702.20b: Attacking doesn't cause a creature with vigilance to tap.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_TapAttacker
                && event.permanent === this.ability.source),
        };
    }
}
