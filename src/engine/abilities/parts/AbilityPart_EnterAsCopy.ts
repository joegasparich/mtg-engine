import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart,EntryReplacementOrder } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_EnterAsCopy extends AbilityPart {
    copyFrom: GrammarKey;
    outSignal: string;
    inSignal: string;
    modify?: { signal: string; saveAs: GrammarKey };
    override readonly entryReplacementOrder = EntryReplacementOrder.Copy;
    private finishEntry?: () => void;

    replaceEntry(entering: Permanent, resume: () => void) {
        // 614.12a, 707.5: Keep the entry pending until the copy source is determined.
        this.finishEntry = () => {
            const original = resolveAbilityGrammar(this.copyFrom, this.ability);
            if (original instanceof Permanent && original.zone instanceof Battlefield)
                entering.enterAsCopyOf(original, this.copyDefinition(original));
            resume();
        };
        this.ability.fireSignal(this.outSignal);
    }

    private copyDefinition(original: Permanent) {
        if (!this.modify)
            return original.def;
        // 707.9b: Changes made to this draft become copiable when the permanent enters.
        const draft = { ...original.def };
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

    onSignalFired(signal: string) {
        if (signal === this.inSignal && this.finishEntry) {
            const finish = this.finishEntry;
            this.finishEntry = undefined;
            finish();
        }
    }
}
