import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Effect extends AbilityPart {
    inSignal = "default";

    onSignalFired(signal: string) {
        if (signal === this.inSignal)
            this.perform();
    }

    perform() {
    }
}