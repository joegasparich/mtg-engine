import type { Ability } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DestroyPermanent,GameEvent_RegeneratePermanent } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { Spell } from "@engine/GameObject";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_PreventRegeneration extends AbilityPart {
    private endEffect?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source instanceof Spell))
            return;

        this.endEffect ??= gameEventManager.effects.startContinuous(ability, {
            kind: ContinuousEffectKind.CheckOverride,
            // 701.19c: This spell's destruction bypasses regeneration shields from any source.
            allow: (event, _source, replacement) => event instanceof GameEvent_DestroyPermanent
                && event.effect?.ability.source === ability.source && replacement instanceof GameEvent_RegeneratePermanent,
        });
    }

    cleanup() {
        this.endEffect?.();
        this.endEffect = undefined;
    }
}
