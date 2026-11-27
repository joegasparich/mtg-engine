import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareAttacker } from "@engine/events/GameEvent_CardInteractionChecks";
import type { TargetValidator } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_AttackRequiresDefenderPermanent extends AbilityPart_ContinuousEffect {
    attacker: GrammarKey;
    targetValidator: TargetValidator;

    protected getContinuousEffect(): ContinuousEffect {
        // 508.1c: Check the defending player's permanents when declaring the attack.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareAttacker
                && event.attacker === resolveAbilityGrammar(this.attacker, this.ability)
                && !event.defender?.battlefield.objects.some(permanent => matchesTargetValidator(permanent, this.targetValidator))),
        };
    }
}
