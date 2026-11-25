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
    amount: number;
    target: GrammarKey;

    perform(effect: OneShotEffect) {
        const source = resolveAbilityGrammar(this.source, this.ability);
        const target = resolveAbilityGrammar(this.target, this.ability);

        if (source instanceof CardObject && (target instanceof Permanent || target instanceof Player))
            effect.emit(new GameEvent_DealDamage(source, target, this.amount));
    }
}
