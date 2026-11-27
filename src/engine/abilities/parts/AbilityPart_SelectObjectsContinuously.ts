import type { GrammarKey } from "@engine/abilities";
import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ObjectSelection,selectObjects } from "@engine/abilities/ZoneSelection";
import { Battlefield,type ZoneKind } from "@engine/Zone";
import { defineComputedProperty } from "@utility/objectUtility";
import type { TargetValidator } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_SelectObjectsContinuously extends AbilityPart implements ObjectSelection {
    saveAs: string;
    target?: GrammarKey;
    zone?: ZoneKind;
    zoneOf?: GrammarKey;
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
    excludeSource?: boolean;
    private clearSelection?: () => void;

    continuousSelection(key: string) {
        if (key !== this.saveAs) return undefined;
        return selectObjects(this.ability, this);
    }

    setup(ability: Ability) {
        super.setup(ability);
        const { source, slate } = ability;
        if (!(source.zone instanceof Battlefield))
            return;

        // 611.3a, 611.3c: A static effect sees the current selection, including permanents as they enter.
        this.clearSelection = defineComputedProperty(slate, this.saveAs, () => this.continuousSelection(this.saveAs));
    }

    cleanup() {
        this.clearSelection?.();
        this.clearSelection = undefined;
    }
}
