import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Trigger extends AbilityPart {
    outSignal = "default";

    onTrigger() {
        // TODO: Needs to go on the stack

        this.ability.fireSignal(this.outSignal);
    }
}