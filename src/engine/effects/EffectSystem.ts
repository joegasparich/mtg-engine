import type { Ability } from "@engine/abilities/Ability";
import type gameEventManager from "@engine/events/GameEventManager";
import type { GameEvent } from "@engine/events/GameEventManager";
import type { CardObject,Permanent } from "@engine/GameObject";
import { removeIf } from "@utility/arrayUtility";
import type { AbilityDef,Keyword } from "~/defs";

type EventDispatcher = Pick<typeof gameEventManager, "addEvent" | "performImmediate" | "performSimultaneous" | "continueResolution">;

export interface EventCheck {
    readonly events: readonly GameEvent[];
    add(event: GameEvent): void;
    replace(event: GameEvent, replacement: GameEvent): void;
    removeWhere(predicate: (event: GameEvent) => boolean): void;
}

export type CheckListener = (check: EventCheck) => void;
export type CheckSource = { readonly object: CardObject; readonly keyword?: Keyword; readonly ability?: Ability };
export type CheckRemovalOverride = (event: GameEvent, source: CheckSource) => boolean;

export enum ContinuousEffectKind {
    EventCheck,
    CheckOverride,
    AbilityGrant,
    ModifyPowerToughness,
}

export type ContinuousEffect =
    | { kind: ContinuousEffectKind.EventCheck; check: CheckListener }
    | { kind: ContinuousEffectKind.CheckOverride; allow: CheckRemovalOverride }
    | { kind: ContinuousEffectKind.AbilityGrant; recipient: Permanent; grant: AbilityDef; onGrantChanged?: (granted?: Ability) => void }
    | { kind: ContinuousEffectKind.ModifyPowerToughness; recipient: Permanent; power: number; toughness: number };

// 609.1 and 610.1: A resolving instruction produces events and can continue after a player choice.
export class OneShotEffect {
    constructor(readonly ability: Ability, private readonly events: EventDispatcher) {}

    emit(event: GameEvent) {
        event.effect = this;
        this.events.addEvent(event);
    }

    performImmediate(event: GameEvent) {
        event.effect = this;
        this.events.performImmediate(event);
    }

    performSimultaneous(events: GameEvent[]) {
        for (const event of events)
            event.effect = this;
        this.events.performSimultaneous(events);
    }

    continueResolution(callback: () => void) {
        this.events.continueResolution(callback);
    }
}

export class EffectSystem {
    private readonly eventChecks = new Map<CheckListener, CheckSource | undefined>();
    private readonly checkOverrides = new Set<CheckRemovalOverride>();
    private readonly activeContinuousEffects = new Set<() => void>();

    constructor(private readonly events: EventDispatcher) {}

    resolveOneShot(ability: Ability, apply: (effect: OneShotEffect) => void) {
        apply(new OneShotEffect(ability, this.events));
    }

    startContinuous(ability: Ability, effect: ContinuousEffect): () => void {
        const stop = this.applyContinuous(ability, effect);
        const end = () => {
            if (this.activeContinuousEffects.delete(end))
                stop();
        };
        this.activeContinuousEffects.add(end);
        return end;
    }

    endContinuousEffects() {
        for (const end of this.activeContinuousEffects)
            end();
    }

    private applyContinuous(ability: Ability, effect: ContinuousEffect): () => void {
        switch (effect.kind) {
            case ContinuousEffectKind.EventCheck:
                this.onCheck(effect.check, { object: ability.source, keyword: ability.def.keyword, ability });
                return () => this.offCheck(effect.check);
            case ContinuousEffectKind.CheckOverride:
                this.onCheckRemovalOverride(effect.allow);
                return () => this.offCheckRemovalOverride(effect.allow);
            case ContinuousEffectKind.AbilityGrant: {
                const { ability: granted, revoke } = effect.recipient.grantAbility(effect.grant, ability.source);
                effect.onGrantChanged?.(granted);
                return () => {
                    effect.onGrantChanged?.();
                    revoke();
                };
            }
            case ContinuousEffectKind.ModifyPowerToughness:
                return effect.recipient.addPowerToughnessModifier(effect.power, effect.toughness);
        }
    }

    onCheck(check: CheckListener, source?: CheckSource) {
        if (!this.eventChecks.has(check))
            this.eventChecks.set(check, source);
    }

    offCheck(check: CheckListener) {
        this.eventChecks.delete(check);
    }

    onCheckRemovalOverride(allow: CheckRemovalOverride) {
        this.checkOverrides.add(allow);
    }

    offCheckRemovalOverride(allow: CheckRemovalOverride) {
        this.checkOverrides.delete(allow);
    }

    checkEvents(events: GameEvent[], checkedEvent?: GameEvent): GameEvent | undefined {
        for (const [check, source] of this.eventChecks) {
            check({
                events,
                add: event => { events.push(event); },
                replace: (event, replacement) => {
                    const index = events.indexOf(event);
                    if (index < 0 || !this.canRemove(event, source))
                        return;

                    replacement.effect ??= event.effect;
                    events[index] = replacement;
                    if (checkedEvent === event)
                        checkedEvent = replacement;
                },
                removeWhere: predicate => removeIf(events, event => predicate(event) && this.canRemove(event, source)),
            });
        }
        return events.includes(checkedEvent) ? checkedEvent : undefined;
    }

    private canRemove(event: GameEvent, source?: CheckSource): boolean {
        if (source) {
            for (const allow of this.checkOverrides) {
                if (allow(event, source))
                    return false;
            }
        }
        return true;
    }
}
