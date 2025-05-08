import {ActivatedAbilityCostWorker} from "./triggeredAbilityCosts";
import {AbilityEffectWorker} from "./abilityEffects";
import {AbilityEffectType, ActivatedAbilityCostType} from "./CardDef";

export const activatedAbilitiesCosts = new Map<ActivatedAbilityCostType, ActivatedAbilityCostWorker>();
export const abilityEffects = new Map<AbilityEffectType, AbilityEffectWorker>();

function setup() {
    for (const worker of ActivatedAbilityCostWorker.GetImplementations()) {
        const instance = new worker();
        activatedAbilitiesCosts.set(instance.type, instance);
    }
    for (const worker of AbilityEffectWorker.GetImplementations()) {
        const instance = new worker();
        abilityEffects.set(instance.type, instance);
    }
}

setup();