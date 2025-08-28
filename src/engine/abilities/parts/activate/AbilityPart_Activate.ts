import Card from "@engine/Card";
import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Activate extends AbilityPart {
    outSignal = "default";

    canActivate(card: Card): boolean {
        return false;
    }

    payCost(card: Card) {
    }

    resolve() {
        this.ability.fireSignal(this.outSignal);
    }
}