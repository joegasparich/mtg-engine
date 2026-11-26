import type { GrammarKey } from "@engine/abilities";
import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { selectObjectsFromZone,type ZoneSelection } from "@engine/abilities/ZoneSelection";
import { Battlefield,type ZoneKind } from "@engine/Zone";
import { defineComputedProperty } from "@utility/objectUtility";
import type { TargetValidator } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_SelectObjectsFromZoneContinuously extends AbilityPart implements ZoneSelection {
    saveAs: string;
    zone: ZoneKind;
    zoneOf?: GrammarKey;
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
    excludeSource = false;
    private clearSelection?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source, slate } = ability;
        if (!(source.zone instanceof Battlefield))
            return;

        // 611.3a, 611.3c: A static effect sees the current selection, including permanents as they enter.
        this.clearSelection = defineComputedProperty(slate, this.saveAs, () => {
            const objects = selectObjectsFromZone(ability, this);
            return this.excludeSource ? objects.filter(object => object !== source) : objects;
        });
    }

    cleanup() {
        this.clearSelection?.();
        this.clearSelection = undefined;
    }
}
