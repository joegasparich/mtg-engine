import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import { CardObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { GrammarKey,resolveAbilityGrammar } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DealDamage extends AbilityPart_Effect {
    source: GrammarKey;
    amount: number | { countFrom: GrammarKey } = 0;
    target: GrammarKey;

    perform(effect: OneShotEffect) {
        const source = resolveAbilityGrammar(this.source, this.ability);
        const target = resolveAbilityGrammar(this.target, this.ability);
        // 608.2h: Read the selected objects when the damage instruction resolves.
        const { amount } = this;
        const damage = typeof amount === "number" ? amount : this.ability.slate[amount.countFrom]?.length ?? 0;

        // 120.8: Zero damage produces no event.
        if (damage === 0)
            return;
        if (source instanceof CardObject && (target instanceof Permanent || target instanceof Player))
            effect.emit(new GameEvent_DealDamage(source, target, damage));
    }
}
