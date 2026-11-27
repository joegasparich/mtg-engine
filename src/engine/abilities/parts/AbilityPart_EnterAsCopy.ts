import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { CardDef } from "~/defs";
import { AbilityPart_AsEnters } from "./AbilityPart_AsEnters";
import { EntryReplacementOrder } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_EnterAsCopy extends AbilityPart_AsEnters {
    copyFrom: GrammarKey;
    modify?: { signal: string; saveAs: GrammarKey };
    override readonly entryReplacementOrder = EntryReplacementOrder.Copy;

    replaceEntry(entering: Permanent, resume: () => void) {
        // 614.12a, 707.5: Keep the entry pending until the copy source is determined.
        super.replaceEntry(entering, () => {
            const original = resolveAbilityGrammar(this.copyFrom, this.ability);
            if (original instanceof Permanent && original.zone instanceof Battlefield)
                entering.enterAsCopyOf(original, this.copyDefinition(original.copiableDefinition));
            resume();
        });
    }

    private copyDefinition(original: Readonly<CardDef>) {
        if (!this.modify)
            return original;
        // 707.9b: Changes made to this draft become copiable when the permanent enters.
        const draft = { ...original };
        const { signal, saveAs } = this.modify;
        const slate = this.ability.slate;
        const previous = slate[saveAs];
        slate[saveAs] = [draft];
        try {
            this.ability.fireSignal(signal);
            return draft;
        } finally {
            if (previous === undefined)
                delete slate[saveAs];
            else
                slate[saveAs] = previous;
        }
    }
}
