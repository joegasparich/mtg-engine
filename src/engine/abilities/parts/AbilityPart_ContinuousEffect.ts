import type { Ability } from "@engine/abilities/Ability";
import type { ContinuousEffect } from "@engine/effects/EffectSystem";
import gameEventManager from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { AbilityPart } from "./AbilityPart";

export abstract class AbilityPart_ContinuousEffect extends AbilityPart {
    private endEffect?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        this.refreshEffect();
    }

    cleanup() {
        this.endEffect?.();
        this.endEffect = undefined;
    }

    protected refreshEffect() {
        this.cleanup();
        // 611.3a–b: Static abilities generate continuous effects while in their active zone.
        if (!(this.ability.source.zone instanceof Battlefield))
            return;

        const effect = this.getContinuousEffect();
        if (effect)
            this.endEffect = gameEventManager.effects.startContinuous(this.ability, effect);
    }

    protected abstract getContinuousEffect(): ContinuousEffect | undefined;
}
