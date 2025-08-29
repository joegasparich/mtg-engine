import Card from "@engine/Card";
import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Activate extends AbilityPart {
    outSignal = "default";

    canActivate(): boolean {
        return false;
    }

    payCost() {
    }

    resolve() {
        this.ability.fireSignal(this.outSignal);
    }
}