import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DestroyPermanent } from "@engine/events/GameEvent_ChangeCardZone";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Indestructible extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        // 702.12b: A permanent with indestructible can't be destroyed, including by lethal damage.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DestroyPermanent
                && event.permanent === this.ability.source),
        };
    }
}
