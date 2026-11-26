import { type Ability,type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamageRedirectionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { canReceiveDamage } from "@engine/events/GameEvent_DealDamage";
import gameEventManager from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_RedirectDamage extends AbilityPart_Effect {
    from: GrammarKey;
    to: GrammarKey;
    amount: number;
    continuous = false;
    sourcesFrom?: GrammarKey;
    private endEffect?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!this.continuous || !(ability.source.zone instanceof Battlefield))
            return;

        // 611.3a and 614.9: Read the current selections as damage would be dealt.
        const { from, to, sourcesFrom } = this;
        this.endEffect ??= gameEventManager.effects.startContinuous(ability, {
            kind: ContinuousEffectKind.DamageEffect,
            rule: {
                kind: DamageRedirectionKind.EveryHit,
                get destination() {
                    const target = resolveAbilityGrammar(to, ability);
                    return canReceiveDamage(target) ? target : undefined;
                },
                matches: hit => hit.recipient === resolveAbilityGrammar(from, ability)
                    && (!sourcesFrom || ability.slate[sourcesFrom]?.includes(hit.source) === true),
            },
        });
    }

    cleanup() {
        this.endEffect?.();
        this.endEffect = undefined;
    }

    perform() {
        if (this.continuous)
            return;
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
