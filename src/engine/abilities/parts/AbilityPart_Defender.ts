import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareAttacker } from "@engine/events/GameEvent_CardInteractionChecks";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Defender extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        // 702.3b: A creature with defender cannot attack.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareAttacker
                && event.attacker === this.ability.source),
        };
    }
}
