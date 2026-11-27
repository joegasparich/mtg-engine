import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_TapCard } from "@engine/events/GameEvent_TapCard";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_TapPermanents extends AbilityPart_Effect {
    permanentsFrom: string;
    outSignal?: string;

    perform(effect: OneShotEffect) {
        const permanents = getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield);
        // CR 701.26a: Only untapped permanents can be tapped.
        const taps = permanents.filter(permanent => !permanent.tapped).map(permanent => new GameEvent_TapCard(permanent));
        if (taps.length)
            effect.performSimultaneous(taps);
        if (this.outSignal)
            effect.continueResolution(() => this.ability.fireSignal(this.outSignal));
    }
}
