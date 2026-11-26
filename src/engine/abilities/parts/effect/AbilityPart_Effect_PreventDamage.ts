import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamagePreventionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import gameEventManager from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_PreventDamage extends AbilityPart_Effect {
    target: GrammarKey;
    amount: number | string;

    perform() {
        const recipient = resolveAbilityGrammar(this.target, this.ability);
        const amount = typeof this.amount === "string" ? this.ability.slate[this.amount]?.[0] : this.amount;
        if (!(recipient instanceof Permanent || recipient instanceof Player) || !Number.isSafeInteger(amount) || amount <= 0)
            return;

        // 615.7: Prevent this many points of damage to the recipient over the rest of the turn.
        gameEventManager.startContinuousUntilEndOfTurn(this.ability, {
            kind: ContinuousEffectKind.DamageEffect,
            rule: { kind: DamagePreventionKind.Points, recipient, amount },
        });
    }
}
