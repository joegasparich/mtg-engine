import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import type { Characteristics } from "@engine/effects/Layers";
import { game } from "@engine/Game";
import { type CardObject,StackAbility } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_NoPermanents extends AbilityPart_Trigger {
    permanentsFrom: string;
    private pending?: StackAbility;

    reconcileLayers(states: ReadonlyMap<CardObject, Characteristics>) {
        const { source } = this.ability;
        const state = states.get(source);
        if (!(source.zone instanceof Battlefield) || !state?.abilities.includes(this.ability))
            return;

        // 603.8: Observe the committed state, even during resolution. A waiting or stacked
        // occurrence suppresses further triggers until that stack object leaves.
        if (this.pending && !this.pending.retired) return;
        if (getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield).length) return;

        this.pending = new StackAbility(state.controller, source, this.ability, this.outSignal);
        game.stack.queueTrigger(this.pending);
    }
}
