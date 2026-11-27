import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import type { CardType } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_CanOnlyBeBlockedBy extends AbilityPart_ContinuousEffect {
    attacker: GrammarKey = "THIS";
    allowedTypes: readonly CardType[] = [];
    allowedSubtypes: readonly string[] = [];

    protected getContinuousEffect(): ContinuousEffect {
        // 509.1b: A proposed block must obey every applicable restriction.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareBlocker
                && event.attacker === resolveAbilityGrammar(this.attacker, this.ability)
                && !event.blocker.types.some(type => this.allowedTypes.includes(type))
                && !event.blocker.subtypes.some(subtype => this.allowedSubtypes.includes(subtype))),
        };
    }
}
