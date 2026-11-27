import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import { change,Layer } from "@engine/effects/Layers";
import { Battlefield } from "@engine/Zone";
import { BasicLandType,CardType } from "~/defs";
import { AbilityPart } from "./AbilityPart";

// 205.3i: A permanent can also have subtypes belonging to its other card types.
const landTypes = new Set<string>([...Object.values(BasicLandType), "Cave", "Desert", "Gate", "Lair", "Locus",
    "Mine", "Planet", "Power-Plant", "Sphere", "Tower", "Town", "Urza’s", "Urza's"]);

@RegisterAbilityPart
export class AbilityPart_SetBasicLandType extends AbilityPart {
    landsFrom: string;
    landType: BasicLandType;

    layerEffect() {
        return { select: () => getObjectsFromSlateInZones(this.ability, this.landsFrom, Battlefield)
            .filter(object => object.hasType(CardType.Land)),
            changes: [change(Layer.Type, () => [this.landType] as const, (state, type) => {
                // 305.7: Setting a basic land type replaces land subtypes and rules-text abilities.
                state.subtypes = [...state.subtypes.filter(subtype => !landTypes.has(subtype)), type];
                state.abilities = [];
            })] };
    }
}
