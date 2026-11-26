import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Battlefield } from "@engine/Zone";
import { defineComputedProperty } from "@utility/objectUtility";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_SelectObjectContinuously extends AbilityPart {
    target: GrammarKey;
    saveAs: string;
    private clearSelection?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source, slate } = ability;
        if (!(source.zone instanceof Battlefield))
            return;

        // 611.3a: Reevaluate the selection whenever the static effect reads it.
        this.clearSelection = defineComputedProperty(slate, this.saveAs, () => {
            const target = resolveAbilityGrammar(this.target, ability);
            return target ? [target] : [];
        });
    }

    cleanup() {
        this.clearSelection?.();
        this.clearSelection = undefined;
    }
}
