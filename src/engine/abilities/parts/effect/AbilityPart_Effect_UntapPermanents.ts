import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_UntapCard } from "@engine/events/GameEvent_UntapCard";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_UntapPermanents extends AbilityPart_Effect {
    permanentsFrom: string;
    outSignal?: string;

    perform(effect: OneShotEffect) {
        const permanents = getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield);
        // 701.26b: Only tapped permanents can be untapped.
        const untaps = permanents.filter(permanent => permanent.tapped).map(permanent => new GameEvent_UntapCard(permanent));
        if (untaps.length)
            effect.performSimultaneous(untaps);
        if (this.outSignal)
            effect.continueResolution(() => this.ability.fireSignal(this.outSignal));
    }
}
