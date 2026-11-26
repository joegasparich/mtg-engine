import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getBattlefieldPermanentsFromSlate } from "@engine/abilities/ZoneSelection";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_ModifyPowerToughness extends AbilityPart_ContinuousEffect {
    permanentsFrom: string;
    power = 0;
    toughness = 0;

    protected getContinuousEffect(): ContinuousEffect {
        return {
            kind: ContinuousEffectKind.ModifyPowerToughness,
            recipients: () => getBattlefieldPermanentsFromSlate(this.ability, this.permanentsFrom),
            power: this.power,
            toughness: this.toughness,
        };
    }
}
