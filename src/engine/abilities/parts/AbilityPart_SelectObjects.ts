import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ObjectSelection,selectObjects } from "@engine/abilities/ZoneSelection";
import type { ZoneKind } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_SelectObjects extends AbilityPart_Effect implements ObjectSelection {
    saveAs: string;
    target?: GrammarKey;
    zone?: ZoneKind;
    zoneOf?: GrammarKey;
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
    excludeSource?: boolean;
    outSignal?: string;

    perform() {
        this.ability.slate[this.saveAs] = selectObjects(this.ability, this);
        if (this.outSignal)
            this.ability.fireSignal(this.outSignal);
    }
}
