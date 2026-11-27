import { AbilityPart } from "@engine/abilities/parts/AbilityPart";
import { AbilityPart_Target } from "@engine/abilities/parts/AbilityPart_Target";
import type { WordReplacement } from "~/rulesWords";
import type { CardObject } from "@engine/GameObject";
import gameEventManager from "@engine/events/GameEventManager";
import { ManaAmount,ManaUtility } from "@engine/mana";
import type { LayerEffect,TimedEffect } from "@engine/effects/Layers";
import type Player from "@engine/Player";
import { AbilityActivator,AbilityDef } from "~/defs";
import { SlateVar } from ".";
import { AbilityPart_Activate } from "./parts/activate/AbilityPart_Activate";
import { AbilityPart_Activate_Mana } from "./parts/activate/AbilityPart_Activate_Mana";
import { AbilityPart_Activate_Tap } from "./parts/activate/AbilityPart_Activate_Tap";
import { AbilityPart_Effect_AddMana } from "./parts/effect/AbilityPart_Effect_AddMana";

// Architecture:
// Abilities are made up of several parts, which communicate with signals
// For simple abilities, the signals can be ignored, as triggers and effects have a "default" signal
// Parts can store arbitrary data in the slate for use by other parts
// Effect parts send resolving instructions or continuous effects to the effect system
// Trigger parts are only used by triggered abilities, and are responsible for setting up listeners and firing their signal via onTrigger
// Activate parts are only used by activated abilities, and are activated via the UI, which is accessed through public methods in this class
// Target parts validate choices and store them in the slate when the spell or ability resolves

// This class assumes that once its parts are set up it won't change
// For caching purposes
export class Ability {
    def: AbilityDef;
    originalDefinition: AbilityDef;
    parts: AbilityPart[] = [];
    slate: Record<SlateVar | string, any> = {};
    source: CardObject;

    constructor(source: CardObject, readonly grantedBy?: CardObject) {
        this.slate["THIS"] = [ source ];
        this.source = source;
    }

    // CR 612.3, 113.7a: Granted text belongs to the granting instruction.
    // A stack ability takes a snapshot of the words at activation or trigger time.
    wordSource?: () => readonly WordReplacement[];

    get wordReplacements(): readonly WordReplacement[] {
        return this.wordSource?.() ?? (this.grantedBy ? [] : this.source.characteristics.wordReplacements);
    }

    private staticEffects?: TimedEffect[];
    grantTimestamp?: () => number;

    get timestamp() { return Math.max(this.source.timestamp, this.grantTimestamp?.() ?? 0); }

    get layerEffects(): readonly TimedEffect[] {
        if (!this.staticEffects) {
            const groups: LayerEffect[] = [];
            for (const part of this.parts) {
                const effect = part.layerEffect?.();
                if (!effect) continue;
                const previous = effect.selectionKey && groups.find(group => group.selectionKey === effect.selectionKey);
                if (previous) previous.changes = [...previous.changes, ...effect.changes];
                else groups.push(effect);
            }
            this.staticEffects = groups.map(effect => ({ ...effect, timestamp: () => this.timestamp }));
        }
        return this.staticEffects;
    }

    private listening = false;

    addPart(part: AbilityPart) {
        this.parts.push(part);
        part.ability = this;
    }

    setup() {
        this.listening = true;
        gameEventManager.withCheckSource({ object: this.source, keyword: this.def?.keyword, ability: this }, () => {
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

    get controller(): Player | undefined { return this.slate.CONTROLLER?.[0]; }

    get activator(): Player {
        // 602.2: The controller activates by default unless the object says otherwise.
        return this.def.activator === AbilityActivator.Owner ? this.source.owner : this.source.controller ?? this.source.owner;
    }

    private _activationParts?: AbilityPart_Activate[];
    private get activationParts() {
        return this._activationParts ??= this.parts.filter(part => part instanceof AbilityPart_Activate);
    }

    get activatable() { return this.activationParts.length > 0; }
    get isFreeTap() { return this.activationParts.length === 1 && this.activationParts[0] instanceof AbilityPart_Activate_Tap; }
    get targeter() { return this.parts.find(part => part instanceof AbilityPart_Target); }

    private get reservedManaSource() {
        return this.activationParts.some(part => part instanceof AbilityPart_Activate_Tap) ? this.source : undefined;
    }

    canActivate(): boolean {
        const reservedManaSource = this.reservedManaSource;
        return this.activatable
            && this.activationParts.every(part => part instanceof AbilityPart_Activate_Mana
                ? part.canActivate(reservedManaSource) : part.canActivate())
            && (this.targeter?.hasLegalTargets() ?? true);
    }

    payActivationCost(): boolean {
        const mana = this.activationParts.find(part => part instanceof AbilityPart_Activate_Mana);
        const payOtherCosts = () => this.activationParts.every(part => part === mana || part.payCost());
        // 602.2b and 601.2g–h: Produce mana before paying costs and spend it only if the other costs are paid.
        return mana ? mana.payCost(payOtherCosts, this.reservedManaSource) : payOtherCosts();
    }

    get activationSignal() {
        return this.activationParts[0].outSignal;
    }

    resolveActivation() {
        return this.activationParts[0].resolve();
    }

    getPotentialMana(): ManaAmount {
        const mana: ManaAmount = [0, 0, 0, 0, 0, 0];

        this.parts
            .filter(p => p instanceof AbilityPart_Effect_AddMana)
            .forEach((p: AbilityPart_Effect_AddMana) => ManaUtility.addMana(mana, ManaUtility.parseManaString(p.mana)));

        return mana;
    }
}
