import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_SacrificePermanent extends AbilityPart_Effect {
    target: GrammarKey;

    perform(effect: OneShotEffect) {
        const { ability } = this;
        const player = ability.controller ?? ability.source.controller;
        const permanent = resolveAbilityGrammar(this.target, ability);
        if (player && permanent instanceof Permanent && permanent.zone instanceof Battlefield)
            effect.emit(new GameEvent_SacrificePermanent(player, permanent));
    }
}
