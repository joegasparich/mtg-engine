import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import { statModifier } from "@engine/effects/PowerToughness";
import { Battlefield } from "@engine/Zone";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ModifyPowerToughness extends AbilityPart {
    permanentsFrom: string;
    power = 0;
    toughness = 0;

    layerEffect() {
        return { selectionKey: this.permanentsFrom,
            select: () => getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield),
            changes: [statModifier(this.power, this.toughness)] };
    }
}
