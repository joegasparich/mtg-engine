import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_ModifyPowerToughness extends AbilityPart_ContinuousEffect {
    permanentsFrom: string;
    power = 0;
    toughness = 0;

    protected getContinuousEffect(): ContinuousEffect {
        const { slate } = this.ability;
        return {
            kind: ContinuousEffectKind.ModifyPowerToughness,
            appliesTo: candidate => {
                if (!(candidate instanceof Permanent) || !(candidate.zone instanceof Battlefield))
                    return false;

                const permanents: readonly Permanent[] = slate[this.permanentsFrom];
                return permanents?.includes(candidate) ?? false;
            },
            power: this.power,
            toughness: this.toughness,
        };
    }
}
