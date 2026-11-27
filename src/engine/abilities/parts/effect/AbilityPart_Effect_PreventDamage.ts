import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamagePreventionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import gameEventManager from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_PreventDamage extends AbilityPart_Effect {
    target: GrammarKey;
    amount: number | GrammarKey;

    perform() {
        const target = resolveAbilityGrammar(this.target, this.ability);
        const amount = typeof this.amount === "string" ? resolveAbilityGrammar(this.amount, this.ability) : this.amount;
        if (!(target instanceof Permanent || target instanceof Player || target instanceof GameEvent_DealDamage)
            || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0)
            return;

        // CR 615.3, 615.7: An unused shield lasts at most until cleanup.
        gameEventManager.startContinuousUntilEndOfTurn(this.ability, {
            kind: ContinuousEffectKind.DamageEffect,
            rule: { kind: DamagePreventionKind.Points, target, amount },
        });
    }
}
