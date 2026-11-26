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
    override readonly entryReplacementOrder = EntryReplacementOrder.Copy;
    private finishEntry?: () => void;

    replaceEntry(entering: Permanent, resume: () => void) {
        // 614.12a, 707.5: Keep the entry pending until the copy source is determined.
        this.finishEntry = () => {
            const original = resolveAbilityGrammar(this.copyFrom, this.ability);
            if (original instanceof Permanent && original.zone instanceof Battlefield)
                entering.enterAsCopyOf(original);
            resume();
        };
        this.ability.fireSignal(this.outSignal);
    }

    onSignalFired(signal: string) {
        if (signal === this.inSignal && this.finishEntry) {
            const finish = this.finishEntry;
            this.finishEntry = undefined;
            finish();
        }
    }
}
