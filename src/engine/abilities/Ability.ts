import { AbilityPart } from "@engine/abilities/parts/AbilityPart";
import type { CardObject } from "@engine/GameObject";
import gameEventManager from "@engine/events/GameEventManager";
import { ManaAmount,ManaUtility } from "@engine/mana";
import { AbilityDef } from "~/defs";
import { SlateVar } from ".";
import { AbilityPart_Activate } from "./parts/activate/AbilityPart_Activate";
import { AbilityPart_Activate_Tap } from "./parts/activate/AbilityPart_Activate_Tap";
import { AbilityPart_Effect_AddMana } from "./parts/effect/AbilityPart_Effect_AddMana";

// Architecture:
// Abilities are made up of several parts, which communicate with signals
// For simple abilities, the signals can be ignored, as triggers and effects have a "default" signal
// Parts can store arbitrary data in the slate for use by other parts
// Effect parts are responsible for firing some game event when they receive their signal
// Trigger parts are only used by triggered abilities, and are responsible for setting up listeners and firing their signal via onTrigger
// Activate parts are only used by activated abilities, and are activated via the UI, which is accessed through public methods in this class
// Target parts fire a game event to tell the UI to create a targeter, and fire a signal when they receive their target

// This class assumes that once its parts are set up it won't change
// For caching purposes
export class Ability {
    def: AbilityDef;
    parts: AbilityPart[] = [];
    slate: Record<SlateVar | string, any> = {};
    source: CardObject;

    constructor(source: CardObject) {
        this.slate["THIS"] = [ source ];
        this.source = source;
    }

    private listening = false;

    addPart(part: AbilityPart) {
        this.parts.push(part);
        part.ability = this;
    }

    setup() {
        this.listening = true;
        gameEventManager.withCheckSource({ object: this.source, keyword: this.def?.keyword }, () => {
            this.parts.forEach(part => part.setup(this));
        });
    }

    fireSignal(signal: string) {
        this.parts.forEach(part => part.onSignalFired(signal));
    }

    cleanup() {
        if (this.listening)
            this.parts.forEach(part => part.cleanup(this));
        this.listening = false;
    }

    //-- Getters --//

    private _activatable?: boolean;
    get activatable() { return this._activatable ??= this.parts.some(p => p instanceof AbilityPart_Activate); }

    private _isFreeTap?: boolean;
    get isFreeTap(): boolean { return this._isFreeTap ??= this.parts.some(p => p instanceof AbilityPart_Activate_Tap); }

    canActivate(): boolean {
        return this.parts.find(p => p instanceof AbilityPart_Activate).canActivate();
    }

    payActivationCost() {
        return this.parts.find(p => p instanceof AbilityPart_Activate).payCost();
    }

    get activationSignal() {
        return this.parts.find(p => p instanceof AbilityPart_Activate).outSignal;
    }

    resolveActivation() {
        return this.parts.find(p => p instanceof AbilityPart_Activate).resolve();
    }

    getPotentialMana(): ManaAmount {
        const mana: ManaAmount = [0, 0, 0, 0, 0, 0];

        this.parts
            .filter(p => p instanceof AbilityPart_Effect_AddMana)
            .forEach((p: AbilityPart_Effect_AddMana) => ManaUtility.addMana(mana, ManaUtility.parseManaString(p.mana)));

        return mana;
    }
}
