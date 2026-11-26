import type { Ability } from "@engine/abilities/Ability";
import { type DamageEffect,DamagePreventionSystem } from "@engine/effects/DamagePrevention";
import type gameEventManager from "@engine/events/GameEventManager";
import type { GameEvent } from "@engine/events/GameEventManager";
import type { CardObject,Permanent } from "@engine/GameObject";
import { removeIf } from "@utility/arrayUtility";
import type { AbilityDef,Keyword } from "~/defs";

type EventDispatcher = Pick<typeof gameEventManager, "addEvent" | "performImmediate" | "performSimultaneous" | "continueResolution">;

export interface EventCheck {
    readonly events: readonly GameEvent[];
    readonly committing: boolean;
    add(event: GameEvent): void;
    replace(event: GameEvent, replacement: GameEvent): void;
    removeWhere(predicate: (event: GameEvent) => boolean): boolean;
}

export type CheckListener = (check: EventCheck) => void;
export type CheckSource = { readonly object: CardObject; readonly keyword?: Keyword; readonly ability?: Ability };
export type CheckRemovalOverride = (event: GameEvent, source: CheckSource, replacement?: GameEvent) => boolean;

export enum EventCheckPhase {
    Proposal,
    PreviewCommit,
    Commit,
}

type EventCheckOptions = {
    readonly beforeCommit?: boolean;
    readonly references?: () => readonly CardObject[];
};

export enum ContinuousEffectKind {
    EventCheck,
    CheckOverride,
    AbilityGrant,
    DamageEffect,
}

export type Recipients = readonly Permanent[] | (() => readonly Permanent[]);

export function getRecipients(recipients: Recipients): readonly Permanent[] {
    return typeof recipients === "function" ? recipients() : recipients;
}

type AbilityGrantEffect = {
    kind: ContinuousEffectKind.AbilityGrant;
    grant: AbilityDef;
    recipients: Recipients;
    onGrantsUpdated?: (grants: readonly Ability[]) => void;
};
export type ContinuousEffect =
    | ({ kind: ContinuousEffectKind.EventCheck; check: CheckListener } & EventCheckOptions)
    | { kind: ContinuousEffectKind.CheckOverride; allow: CheckRemovalOverride }
    | AbilityGrantEffect
    | { kind: ContinuousEffectKind.DamageEffect; rule: DamageEffect };

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
    readonly damagePrevention = new DamagePreventionSystem((hit, source) => this.canRemove(hit, source));
    private readonly eventChecks = new Map<CheckListener, EventCheckOptions & { source?: CheckSource }>();
    private readonly checkOverrides = new Set<CheckRemovalOverride>();
    private readonly activeContinuousEffects = new Set<() => void>();
    private readonly updateAbilityGrants = new Set<() => void>();

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

    refreshAbilityGrants() {
        for (const update of this.updateAbilityGrants)
            update();
    }

    getEventCheckReferences(): CardObject[] {
        return [
            ...[...this.eventChecks.values()].flatMap(check => check.references?.() ?? []),
            ...this.damagePrevention.getSourceReferences(),
        ];
    }

    private applyContinuous(ability: Ability, effect: ContinuousEffect): () => void {
        switch (effect.kind) {
            case ContinuousEffectKind.EventCheck:
                this.onCheck(effect.check, { object: ability.source, keyword: ability.def.keyword, ability }, effect);
                return () => this.offCheck(effect.check);
            case ContinuousEffectKind.CheckOverride:
                this.onCheckRemovalOverride(effect.allow);
                return () => this.offCheckRemovalOverride(effect.allow);
            case ContinuousEffectKind.DamageEffect:
                return this.damagePrevention.register(effect.rule,
                    { object: ability.source, keyword: ability.def.keyword, ability });
            case ContinuousEffectKind.AbilityGrant:
                return this.applyAbilityGrant(ability, effect);
        }
    }

    // TODO: When adding “loses all abilities” or “can't have flying”, resolve active abilities in layer 6 (613.1f).
    // Reconcile that result here so continuing grants keep their identity and listeners start or stop as eligibility changes.
    private applyAbilityGrant(ability: Ability, { recipients, grant, onGrantsUpdated }: AbilityGrantEffect): () => void {
        const grants = new Map<Permanent, ReturnType<Permanent["grantAbility"]>>();
        const update = () => {
            // 611.3a, 613.1f: Keep the same grant instance while a permanent remains eligible.
            const selected = new Set(getRecipients(recipients));
            for (const [recipient, { revoke }] of grants) {
                if (!selected.has(recipient)) {
                    grants.delete(recipient);
                    revoke();
                }
            }
            for (const recipient of selected) {
                if (!grants.has(recipient))
                    grants.set(recipient, recipient.grantAbility(grant, ability.source));
            }
            onGrantsUpdated?.([...grants.values()].map(granted => granted.ability));
        };

        if (typeof recipients === "function")
            this.updateAbilityGrants.add(update);
        update();
        return () => {
            this.updateAbilityGrants.delete(update);
            for (const { revoke } of grants.values())
                revoke();
            grants.clear();
            onGrantsUpdated?.([]);
        };
    }

    onCheck(check: CheckListener, source?: CheckSource, { beforeCommit, references }: EventCheckOptions = {}) {
        if (!this.eventChecks.has(check))
            this.eventChecks.set(check, { source, beforeCommit, references });
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

    checkEvents(events: GameEvent[], checkedEvent?: GameEvent, phase = EventCheckPhase.Proposal): GameEvent | undefined {
        const beforeCommit = phase !== EventCheckPhase.Proposal;
        for (const [check, registration] of this.eventChecks) {
            if (!!registration.beforeCommit !== beforeCommit)
                continue;

            const { source } = registration;
            check({
                events,
                committing: phase === EventCheckPhase.Commit,
                add: event => { events.push(event); },
                replace: (event, replacement) => {
                    const index = events.indexOf(event);
                    if (index < 0 || !this.canRemove(event, source, replacement))
                        return;

                    replacement.effect ??= event.effect;
                    events[index] = replacement;
                    if (checkedEvent === event)
                        checkedEvent = replacement;
                },
                removeWhere: predicate => {
                    const count = events.length;
                    removeIf(events, event => predicate(event) && this.canRemove(event, source));
                    return events.length < count;
                },
            });
        }
        return events.includes(checkedEvent) ? checkedEvent : undefined;
    }

    private canRemove(event: GameEvent, source?: CheckSource, replacement?: GameEvent): boolean {
        if (source) {
            for (const allow of this.checkOverrides) {
                if (allow(event, source, replacement))
                    return false;
            }
        }
        return true;
    }
}
