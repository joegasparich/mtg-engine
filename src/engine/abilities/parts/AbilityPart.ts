import type { Ability } from "@engine/abilities";
import type { GameEvent } from "@engine/events/GameEventManager";
import type { Permanent,Spell } from "@engine/GameObject";

export abstract class AbilityPart {
    ability: Ability;

    resolvePermanentSpell?(spell: Spell): GameEvent;
    checkState?(actions: GameEvent[]): void;
    canAttachTo?(target: Permanent): boolean;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup(ability: Ability) {}

    onSignalFired(signal: string) {}
}
