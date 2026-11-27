import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import { Keyword } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Flying extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        // 702.9b: A creature with flying can be blocked only by creatures with flying or reach.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareBlocker
                && event.attacker === this.ability.source
                && !event.blocker.hasKeyword(Keyword.Flying) && !event.blocker.hasKeyword(Keyword.Reach)),
        };
    }
}
