import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { selectObjectsFromZone,type ZoneSelection } from "@engine/abilities/ZoneSelection";
import type { ZoneKind } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_SelectObjectsFromZone extends AbilityPart_Effect implements ZoneSelection {
    saveAs: string;
    zone: ZoneKind;
    zoneOf?: GrammarKey;
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
    outSignal?: string;

    perform() {
        this.ability.slate[this.saveAs] = selectObjectsFromZone(this.ability, this);
        if (this.outSignal)
            this.ability.fireSignal(this.outSignal);
    }
}
