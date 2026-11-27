import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getBattlefieldPermanentsFromSlate } from "@engine/abilities/ZoneSelection";
import { change,Layer } from "@engine/effects/Layers";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ControlPermanents extends AbilityPart {
    permanentsFrom: string;

    layerEffect() {
        const source = this.ability.source;
        return { selectionKey: this.permanentsFrom,
            select: () => getBattlefieldPermanentsFromSlate(this.ability, this.permanentsFrom),
            changes: [change(Layer.Control, () => [source.controller] as const,
                (state, controller) => { state.controller = controller; })] };
    }
}
