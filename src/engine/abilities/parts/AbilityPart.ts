import type { Ability } from "@engine/abilities";
import type { GameEvent } from "@engine/events/GameEventManager";
import type { Characteristics,LayerEffect } from "@engine/effects/Layers";
import type { CardObject,Permanent,Spell } from "@engine/GameObject";

// 616.1c: Copy replacements precede ordinary battlefield entry replacements.
export enum EntryReplacementOrder {
    Copy,
    Other,
}

export abstract class AbilityPart {
    ability: Ability;

    layerEffect?(): LayerEffect;
    reconcileLayers?(states: ReadonlyMap<CardObject, Characteristics>): void;
    continuousSelection?(key: string): readonly unknown[] | undefined;

    resolvePermanentSpell?(spell: Spell): GameEvent;
    readonly entryReplacementOrder: EntryReplacementOrder = EntryReplacementOrder.Other;
    replaceEntry?(permanent: Permanent, resume: () => void): void;
    checkState?(actions: GameEvent[]): void;
    canAttachTo?(target: Permanent): boolean;
    canCast?(): boolean;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup(_ability: Ability) {}

    onSignalFired(_signal: string) {}
}
