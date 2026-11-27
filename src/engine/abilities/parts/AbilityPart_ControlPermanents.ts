import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import { change,Layer } from "@engine/effects/Layers";
import { Battlefield } from "@engine/Zone";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ControlPermanents extends AbilityPart {
    permanentsFrom: string;

    layerEffect() {
        const source = this.ability.source;
        return { selectionKey: this.permanentsFrom,
            select: () => getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield),
            changes: [change(Layer.Control, () => [source.controller] as const,
                (state, controller) => { state.controller = controller; })] };
    }
}
