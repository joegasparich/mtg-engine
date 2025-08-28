import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Trigger extends AbilityPart {
    outSignal = "default";

    onTrigger() {
        this.ability.fireSignal(this.outSignal);
    }
}