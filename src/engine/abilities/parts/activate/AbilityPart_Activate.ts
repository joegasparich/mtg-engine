import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Activate extends AbilityPart {
    outSignal = "default";

    canActivate(): boolean {
        return false;
    }

    payCost(): boolean {
        return true;
    }

    resolve() {
        this.ability.fireSignal(this.outSignal);
    }
}
