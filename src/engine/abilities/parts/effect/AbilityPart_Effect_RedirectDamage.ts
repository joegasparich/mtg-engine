import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamageRedirectionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { canReceiveDamage } from "@engine/events/GameEvent_DealDamage";
import gameEventManager from "@engine/events/GameEventManager";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_RedirectDamage extends AbilityPart_Effect {
    from: GrammarKey;
    to: GrammarKey;
    amount: number;

    perform() {
        const recipient = resolveAbilityGrammar(this.from, this.ability);
        const destination = resolveAbilityGrammar(this.to, this.ability);
        if (!canReceiveDamage(recipient) || !canReceiveDamage(destination)
            || !Number.isSafeInteger(this.amount) || this.amount <= 0)
            return;

        // 614.9 and 514.2: Redirect future damage to the new recipient until cleanup.
        gameEventManager.startContinuousUntilEndOfTurn(this.ability, {
            kind: ContinuousEffectKind.DamageEffect,
            rule: { kind: DamageRedirectionKind.Points, recipient, destination, amount: this.amount },
        });
    }
}
