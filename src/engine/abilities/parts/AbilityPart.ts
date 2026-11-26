import type { Ability } from "@engine/abilities";
import type { GameEvent } from "@engine/events/GameEventManager";
import type { Permanent,Spell } from "@engine/GameObject";

// 616.1c: Copy replacements precede ordinary battlefield entry replacements.
export enum EntryReplacementOrder {
    Copy,
    Other,
}

export abstract class AbilityPart {
    ability: Ability;

    resolvePermanentSpell?(spell: Spell): GameEvent;
    readonly entryReplacementOrder: EntryReplacementOrder = EntryReplacementOrder.Other;
    replaceEntry?(permanent: Permanent, resume: () => void): void;
    checkState?(actions: GameEvent[]): void;
    canAttachTo?(target: Permanent): boolean;
    canCast?(): boolean;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup(ability: Ability) {}

    onSignalFired(signal: string) {}
}
