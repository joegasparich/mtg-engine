import type { OneShotEffect } from "@engine/effects/EffectSystem";
import gameEventManager from "@engine/events/GameEventManager";
import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Effect extends AbilityPart {
    inSignal = "default";

    onSignalFired(signal: string) {
        if (signal === this.inSignal)
            gameEventManager.effects.resolveOneShot(this.ability, effect => this.perform(effect));
    }

    abstract perform(effect: OneShotEffect): void;
}
