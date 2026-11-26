import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getBattlefieldPermanentsFromSlate } from "@engine/abilities/ZoneSelection";
import type { ContinuousEffect } from "@engine/effects/EffectSystem";
import { modifyPowerToughness } from "@engine/effects/PowerToughness";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_ModifyPowerToughness extends AbilityPart_ContinuousEffect {
    permanentsFrom: string;
    power = 0;
    toughness = 0;

    protected getContinuousEffect(): ContinuousEffect {
        return modifyPowerToughness(() => getBattlefieldPermanentsFromSlate(this.ability, this.permanentsFrom),
            this.power, this.toughness);
    }
}
