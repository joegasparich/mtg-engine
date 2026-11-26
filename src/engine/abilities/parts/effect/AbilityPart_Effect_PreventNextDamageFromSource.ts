import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { DamagePreventionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import gameEventManager from "@engine/events/GameEventManager";
import { CardObject } from "@engine/GameObject";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_PreventNextDamageFromSource extends AbilityPart_Effect {
    source: GrammarKey;
    targetValidator?: TargetValidator;
    onPrevented?: { saveAs: string; outSignal: string };

    perform() {
        const { ability, targetValidator, onPrevented } = this;
        const recipient = ability.controller ?? ability.source.controller;
        const source = resolveAbilityGrammar(this.source, ability);
        if (!recipient || !(source instanceof CardObject))
            return;

        // 615.8–9: Shield the next hit this turn, rechecking any required source quality.
        gameEventManager.startContinuousUntilEndOfTurn(ability, {
            kind: ContinuousEffectKind.DamageEffect,
            rule: {
                kind: DamagePreventionKind.NextHit, recipient, source,
                matches: hit => matchesTargetValidator(hit.source, this),
                equivalenceKey: JSON.stringify(targetValidator),
                onPrevented: onPrevented && (amount => {
                    ability.slate[onPrevented.saveAs] = [amount];
                    ability.fireSignal(onPrevented.outSignal);
                }),
            },
        });
    }
}
