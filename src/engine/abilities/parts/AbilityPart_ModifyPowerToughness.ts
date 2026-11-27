import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getBattlefieldPermanentsFromSlate } from "@engine/abilities/ZoneSelection";
import { statModifier } from "@engine/effects/PowerToughness";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ModifyPowerToughness extends AbilityPart {
    permanentsFrom: string;
    power = 0;
    toughness = 0;

    layerEffect() {
        return { selectionKey: this.permanentsFrom,
            select: () => getBattlefieldPermanentsFromSlate(this.ability, this.permanentsFrom),
            changes: [statModifier(this.power, this.toughness)] };
    }
}
