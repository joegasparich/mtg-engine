import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { type DamageRecipient,GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import { CardObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { GrammarKey,resolveAbilityGrammar } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

type DamageAmount = number | GrammarKey | { countFrom: GrammarKey };
type DamageAssignment = { target: GrammarKey; amount: DamageAmount };

@RegisterAbilityPart
export class AbilityPart_Effect_DealDamage extends AbilityPart_Effect {
    source: GrammarKey;
    assignments: readonly DamageAssignment[];
    saveAs?: string;
    beforeDamageSignal?: string;

    perform(effect: OneShotEffect) {
        const source = resolveAbilityGrammar(this.source, this.ability);
        const amounts = new Map<DamageRecipient, number>();
        // CR 608.2f,h: Read recipients on resolution and deal one instruction's damage simultaneously.
        for (const { target: key, amount } of this.assignments) {
            const target = resolveAbilityGrammar(key, this.ability);
            const damage = typeof amount === "string" ? resolveAbilityGrammar(amount, this.ability)
                : typeof amount === "number" ? amount : this.ability.slate[amount.countFrom]?.length ?? 0;
            // 107.1b, 120.8: Zero or negative damage produces no event.
            if ((target instanceof Permanent || target instanceof Player) && typeof damage === "number" && damage > 0)
                amounts.set(target, (amounts.get(target) ?? 0) + damage);
        }

        const events = source instanceof CardObject
            ? Array.from(amounts, ([target, amount]) => new GameEvent_DealDamage(source, target, amount)) : [];
        if (this.saveAs)
            this.ability.slate[this.saveAs] = events;
        if (!events.length)
            return;
        if (this.beforeDamageSignal)
            this.ability.fireSignal(this.beforeDamageSignal);
        if (events.length === 1)
            effect.emit(events[0]);
        else
            effect.performSimultaneous(events);
    }
}
