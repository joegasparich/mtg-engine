import {AbilityDef} from "~/defs";
import {AbilityPart} from "@engine/abilities/parts/AbilityPart";
import {ActionTarget} from "@engine/actions";
import Card from "@engine/Card";
import {ManaAmount, ManaUtility} from "@engine/mana";
import {AbilityPart_Activate, AbilityPart_Effect_AddMana, SlateVar} from "@engine/abilities/index";
import {Zone} from "@engine/Zone";

// This class assumes that once its parts are set up it won't change
// For caching purposes
export class Ability {
    def: AbilityDef;
    parts: AbilityPart[] = [];
    slate: Record<SlateVar | string, ActionTarget> = {};
    card: Card;

    constructor(card: Card) {
        this.slate["THIS"] = card;
        this.card = card;
    }

    addPart(part: AbilityPart) {
        this.parts.push(part);
        part.setup(this);
    }

    fireSignal(signal: string) {
        this.parts.forEach(part => part.onSignalFired(signal));
    }

    cleanup() {
        this.parts.forEach(part => part.cleanup(this));
    }

    //-- Getters --//

    private _activatable: boolean;
    get activatable() { return this._activatable ??= this.parts.some(p => p instanceof AbilityPart_Activate); }

    canActivate(card: Card): boolean {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.canActivate(card));
    }

    payCost(card: Card) {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.payCost(card));
    }

    resolve() {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.resolve());
    }

    getPotentialMana(): ManaAmount {
        const mana: ManaAmount = [0, 0, 0, 0, 0, 0];

        this.parts
            .filter(p => p instanceof AbilityPart_Effect_AddMana)
            .forEach((p: AbilityPart_Effect_AddMana) => ManaUtility.addMana(mana, ManaUtility.parseManaString(p.mana)));

        return mana;
    }
}