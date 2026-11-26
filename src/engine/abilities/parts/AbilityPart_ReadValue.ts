import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_ReadValue extends AbilityPart_Effect {
    value: GrammarKey;
    saveAs: string;
    outSignal?: string;

    perform() {
        const value = resolveAbilityGrammar(this.value, this.ability);
        this.ability.slate[this.saveAs] = value === undefined ? [] : [value];
        if (this.outSignal)
            this.ability.fireSignal(this.outSignal);
    }
}
