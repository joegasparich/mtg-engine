import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { Permanent } from "@engine/GameObject";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_AsEnters extends AbilityPart {
    outSignal: string;
    inSignal: string;
    private finishEntry?: () => void;

    replaceEntry(_entering: Permanent, resume: () => void) {
        // 614.12a: Finish the choice before the permanent enters the battlefield.
        this.finishEntry = resume;
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
