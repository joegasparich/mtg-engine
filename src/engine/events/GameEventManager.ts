import type { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { Ability } from "@engine/abilities";
import type { DamagePreventionChoices } from "@engine/effects/DamagePrevention";
import { type CheckListener,type CheckRemovalOverride,type CheckSource,type ContinuousEffect,EffectSystem,EventCheckPhase,type OneShotEffect } from "@engine/effects/EffectSystem";
import { type RecordRulesEvent,type RulesBatchListener,type RulesEvent,RulesEventStream } from "./RulesEvent";
import type { GameEvent_DealDamage } from "./GameEvent_DealDamage";

export type { CheckSource,EventCheck } from "@engine/effects/EffectSystem";

export enum GameEventType {
    All,
    Log,
    GoToNextStep,
    GoToStep,
    GoToNextPhase,
    GoToNextTurn,
    TurnStart,
    StepStart,
    StepEnd,
    Cleanup,
    Advance,
    PriorityChanged,
    CastSpell,
    StackAbilityChanged,
    ChangeCardZone,
    ActivateAbility,
    TapCard,
    UntapCard,
    DrawCard,
    DestroyPermanent,
    DeclareAttacker,
    DeclareBlocker,
    CheckBlockLimit,
    CheckRequiredBlock,
    StartTargeting,
    PlayLand,
    SacrificePermanent,
    DiscardCard,
    RequestResolutionChoice,
    SubmitResolutionChoice,
    CheckCombatDamageChooser,
    RequestCombatDamageChoice,
    SubmitCombatDamageChoice,
    CheckTarget,
    CheckAttachment,
    DealDamage,
    AddMana,
    AttachPermanent,
    DrawCards,
    RegeneratePermanent,
    TakeSpecialAction,
    LoseMana,
}

export interface TimestampAssignment {
    card: CardObject;
    player: Player;
    assign(timestamp: number): void;
}
type ChooseTimestamp = (player: Player, cards: CardObject[], next: (card: CardObject) => void) => void;

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    effect?: OneShotEffect;
    callback: () => void;

    get timestampAssignment(): TimestampAssignment | undefined { return undefined; }
    get entryPreparation(): { player: Player; prepare(resume: () => void): void } | undefined { return undefined; }

    perform(_record: RecordRulesEvent): boolean {
        return true;
    }
    then(callback: () => void) {
        this.callback = callback;
    }
}

export class GameEvent_Log extends GameEvent {
    isAction = false;

    constructor(type: GameEventType, label: string) {
        super();

        this.type = type;
        this.label = label;
    }
}

type Listener = (event: GameEvent) => void;
type GameSubscription = { notify: Listener } | { capture: (pending: readonly GameEvent[]) => Listener };
type CapturedListeners = ReadonlyMap<GameEventType, readonly Listener[]>;

function isDamage(event: GameEvent): event is GameEvent_DealDamage {
    return event.type === GameEventType.DealDamage;
}

interface GameSubscriptionOptions<T extends GameEvent> {
    once?: boolean;
    matches?: (event: T) => boolean;
}

class GameEventManager {
    readonly rules = new RulesEventStream();
    private simultaneousRules?: { events: RulesEvent[]; captured: RulesBatchListener[] };
    readonly effects = new EffectSystem(this);
    private readonly eventPerformedListenersByType = new Map<GameEventType, Set<Listener>>();
    private readonly gameListenersByType = new Map<GameEventType, Set<GameSubscription>>();
    private checkSource?: CheckSource;
    private readonly eventsResolvedCallback: (() => void)[] = [];
    private readonly resolutionSteps: (() => void)[] = [];
    private readonly idleCallbacks: (() => void)[] = [];
    private settleState?: () => boolean;
    private waitingForChoice?: () => boolean;
    private advanceWhileIdle?: () => boolean;
    private choices: DamagePreventionChoices;
    private chooseTimestamp: ChooseTimestamp;
    private commitPending = false;
    private currentBatch: GameEvent[] = [];
    private afterBatch?: Set<() => void>;

    afterSimultaneousChanges(update: () => void) {
        if (this.afterBatch)
            this.afterBatch.add(update);
        else
            update();
    }

    startGame(settle: () => boolean, waitingForChoice: () => boolean, advanceWhileIdle: () => boolean,
        damageChoices: DamagePreventionChoices, chooseTimestamp: ChooseTimestamp) {
        for (const listeners of this.gameListenersByType.values())
            listeners.clear();
        this.gameListenersByType.clear();
        this.rules.reset();
        this.effects.layers.reset();
        this.effects.endContinuousEffects();
        this.activeEvents.length = 0;
        this.currentBatch.length = 0;
        this.commitPending = false;
        this.eventsResolvedCallback.length = 0;
        this.resolutionSteps.length = 0;
        this.idleCallbacks.length = 0;
        this.settleState = settle;
        this.waitingForChoice = waitingForChoice;
        this.advanceWhileIdle = advanceWhileIdle;
        this.choices = damageChoices;
        this.chooseTimestamp = chooseTimestamp;
    }

    onPerformed(eventType: GameEventType, listener: Listener) {
        if (!this.eventPerformedListenersByType.has(eventType))
            this.eventPerformedListenersByType.set(eventType, new Set<Listener>());

        this.eventPerformedListenersByType.get(eventType).add(listener);
    }

    offPerformed(eventType: GameEventType, listener: Listener) {
        this.eventPerformedListenersByType.get(eventType).delete(listener);
    }

    onGamePerformed<T extends GameEvent, State>(eventType: GameEventType, listener: (event: T, state: State) => void,
        options: GameSubscriptionOptions<T> & { captureBeforeBatch: (pending: readonly T[]) => State }): () => void;
    onGamePerformed<T extends GameEvent>(eventType: GameEventType, listener: (event: T) => void,
        options?: GameSubscriptionOptions<T>): () => void;
    onGamePerformed<T extends GameEvent, State>(eventType: GameEventType, listener: (event: T, state?: State) => void,
        { once, matches, captureBeforeBatch }: GameSubscriptionOptions<T> & { captureBeforeBatch?: (pending: readonly T[]) => State } = {}): () => void {
        const listeners = this.gameListenersByType.get(eventType) ?? new Set<GameSubscription>();
        this.gameListenersByType.set(eventType, listeners);

        let fired = false;
        const notify = (event: GameEvent, state?: State) => {
            if (fired || matches?.(event as T) === false)
                return;

            if (once) {
                fired = true;
                cancel();
            }
            if (captureBeforeBatch)
                listener(event as T, state);
            else
                listener(event as T);
        };
        const subscription: GameSubscription = captureBeforeBatch ? {
            capture: pending => {
                const state = captureBeforeBatch(pending as readonly T[]);
                return event => notify(event, state);
            },
        } : {
            notify: event => {
                if (listeners.has(subscription))
                    notify(event);
            },
        };
        const cancel = () => { listeners.delete(subscription); };
        listeners.add(subscription);
        return cancel;
    }

    onCheck(listener: CheckListener) {
        this.effects.onCheck(listener, this.checkSource);
    }

    offCheck(listener: CheckListener) {
        this.effects.offCheck(listener);
    }

    withCheckSource(source: CheckSource, register: () => void) {
        const previousSource = this.checkSource;
        this.checkSource = source;
        try {
            register();
        } finally {
            this.checkSource = previousSource;
        }
    }

    onCheckRemovalOverride(override: CheckRemovalOverride) {
        this.effects.onCheckRemovalOverride(override);
    }

    offCheckRemovalOverride(override: CheckRemovalOverride) {
        this.effects.offCheckRemovalOverride(override);
    }

    startContinuousUntilEndOfTurn(ability: Ability, effect: ContinuousEffect) {
        // 514.2: End turn-limited effects during cleanup.
        const end = this.effects.startContinuous(ability, effect);
        this.onGamePerformed(GameEventType.Cleanup, end, { once: true });
    }

    activeEvents: GameEvent[] = [];
    performingEvents: boolean;

    addEvent(event: GameEvent) {
        this.addEvents([event]);
    }

    addEvents(events: GameEvent[]) {
        this.activeEvents.push(...events);
        this.checkForEffects(this.activeEvents);
        this.performAllEvents();
    }

    checkEvent(event: GameEvent) {
        const checked = this.checkForEffects([event], event);
        const preview = checked && this.effects.checkEvents([checked], checked, EventCheckPhase.PreviewCommit);
        return !!preview && (!isDamage(preview) || this.effects.damagePrevention.preview(preview));
    }

    performImmediate(event: GameEvent): boolean {
        if (this.commitPending) {
            this.addEvent(event);
            return false;
        }

        const events = [event];
        const checkedEvent = this.checkForEffects(events, event);
        let performed = false;
        for (const [index, pending] of events.entries()) {
            const result = this.performEvent(pending);
            if (pending === checkedEvent)
                performed = result;
            if (this.commitPending) {
                this.currentBatch.unshift(...events.slice(index + 1));
                break;
            }
        }
        return performed;
    }

    performSimultaneous(events: GameEvent[]): boolean {
        if (this.commitPending) {
            const batch = [...events];
            this.onResolved(() => this.performSimultaneous(batch));
            return false;
        }

        this.checkForEffects(events);
        const prepared = [...events];
        // Each replacement sees the whole simultaneous event (including any other uses of a shield).
        this.effects.checkEvents(prepared, undefined, EventCheckPhase.Commit);
        let performed = false;
        this.commitPrepared(prepared, (results, _, captured) => { performed = this.notifySimultaneous(results, captured); });
        return performed;
    }

    private notifySimultaneous(performed: GameEvent[], captured: CapturedListeners): boolean {
        // 704.3: Commit the whole batch before any listener observes its results.
        const notifications = performed.map(event => ({ event, listeners: this.getGameListeners(event) }));
        this.notifyCapturedListeners(performed, captured);
        for (const { event, listeners } of notifications)
            this.notifyPerformed(event, listeners);
        return performed.some(event => event.isAction);
    }

    onResolved(callback: () => void) {
        this.eventsResolvedCallback.push(callback);
        this.performAllEvents();
    }

    continueResolution(callback: () => void) {
        this.resolutionSteps.push(callback);
        this.performAllEvents();
    }

    onIdle(callback: () => void) {
        this.idleCallbacks.push(callback);
        this.performAllEvents();
    }

    checkForEffects(events: GameEvent[], checkedEvent?: GameEvent): GameEvent | undefined {
        return this.effects.checkEvents(events, checkedEvent);
    }

    performAllEvents() {
        // Check if we're currently in the while loop
        if (this.performingEvents)
            return;

        this.performingEvents = true;

        try {
            for (;;) {
                if (this.commitPending) {
                    // 614.12a, 510.2: Only the choice exchange may run while a commit is suspended.
                    const index = this.activeEvents.findIndex(event => event.type === GameEventType.RequestResolutionChoice
                        || event.type === GameEventType.SubmitResolutionChoice);
                    if (index < 0)
                        break;
                    const [event] = this.activeEvents.splice(index, 1);
                    this.performEvent(event);
                } else if (this.currentBatch.length > 0) {
                    this.performEvent(this.currentBatch.shift());
                } else if (this.activeEvents.length > 0) {
                    this.currentBatch = this.activeEvents;
                    this.activeEvents = [];
                } else if (this.waitingForChoice?.()) {
                    // 117.2e: Process input events before resuming the current game action.
                    break;
                } else if (this.eventsResolvedCallback.length > 0) {
                    this.eventsResolvedCallback.shift()();
                } else if (this.resolutionSteps.length > 0) {
                    this.resolutionSteps.shift()();
                } else if (this.settleState?.()) {
                    continue;
                } else if (this.idleCallbacks.length > 0) {
                    this.idleCallbacks.shift()();
                } else if (this.advanceWhileIdle?.()) {
                    continue;
                } else {
                    break;
                }
            }
        } finally {
            this.performingEvents = false;
        }
    }

    private performEvent(event: GameEvent): boolean {
        const { events, checked } = this.prepareEvent(event);
        let performed = false;
        this.commitPrepared(events, (results, checkedPerformed, captured) => {
            this.notifyCapturedListeners(results, captured);
            for (const pending of results)
                this.notifyPerformed(pending);
            performed = checkedPerformed;
        }, checked);
        return performed;
    }

    private prepareEvent(event: GameEvent) {
        const events = [event];
        const checked = this.effects.checkEvents(events, event, EventCheckPhase.Commit);
        return { events, checked };
    }

    private commitPrepared(events: GameEvent[],
        notify: (performed: GameEvent[], checkedPerformed: boolean, captured: CapturedListeners) => void, checked?: GameEvent) {
        const commit = (damage?: readonly GameEvent_DealDamage[][], afterDamage: readonly (() => void)[] = []) => {
            let damageIndex = 0;
            let checkedPortions: readonly GameEvent[] = [];
            const pending = damage ? events.flatMap(event => {
                if (!isDamage(event))
                    return [event];
                const portions = damage[damageIndex++];
                if (event === checked)
                    checkedPortions = portions;
                return portions;
            }) : events;
            const captured = this.captureGameListeners(pending);
            const enclosingRules = this.simultaneousRules;
            const batch = enclosingRules ?? { events: [], captured: [] };
            batch.captured.push(...this.rules.capture(pending));
            const performed: GameEvent[] = [];
            let checkedPerformed = false;
            const previousBatch = this.afterBatch;
            const layers = this.effects.layers;
            const enclosingSimultaneous = layers.duringSimultaneousChanges;
            if (!enclosingSimultaneous) {
                this.afterBatch = new Set();
                if (pending.length > 1) layers.beginSimultaneousChanges();
            }
            // Nested immediate actions contribute outcomes to the enclosing simultaneous event (CR 700.1).
            if (pending.length > 1) this.simultaneousRules = batch;
            try {
                for (const event of pending) {
                    if (event.perform(outcome => batch.events.push(outcome))) {
                        performed.push(event);
                        checkedPerformed ||= event === checked || checkedPortions.includes(event);
                    }
                }
            } finally {
                this.simultaneousRules = enclosingRules;
                if (!enclosingSimultaneous && pending.length > 1) layers.endSimultaneousChanges();
                layers.changed();
                const updates = this.afterBatch;
                this.afterBatch = previousBatch;
                if (!enclosingSimultaneous)
                    updates?.forEach(update => update());
            }
            if (!enclosingRules) this.rules.publish(batch.events, batch.captured);
            // 615.5: Additional prevention effects follow the damage event, before priority or state checks.
            for (const followUp of afterDamage)
                followUp();
            notify(performed, checkedPerformed, captured);
        };

        const resolveDamage = () => {
            const hits = events.filter(isDamage);
            if (!hits.length) {
                commit();
                return;
            }

            this.commitPending = true;
            this.effects.damagePrevention.resolve(hits, this.choices, (damage, afterDamage) => {
                this.commitPending = false;
                commit(damage, afterDamage);
            });
        };

        // Prepare every entrant against the same pre-event battlefield (707.5).
        const entries = events.map(event => event.entryPreparation).filter(entry => entry !== undefined);
        if (!entries.length) {
            this.orderTimestamps(events, resolveDamage);
            return;
        }
        if (entries.length > 1) {
            // 101.4, 616.1: The active player makes simultaneous choices first.
            const players = this.choices.turnOrder();
            entries.sort((a, b) => players.indexOf(a.player) - players.indexOf(b.player));
        }
        this.commitPending = true;
        const next = (index: number) => {
            if (index < entries.length) {
                entries[index].prepare(() => next(index + 1));
                return;
            }
            this.commitPending = false;
            this.orderTimestamps(events, resolveDamage);
        };
        next(0);
    }

    private orderTimestamps(events: GameEvent[], resume: () => void) {
        if (events.length < 2) return resume();
        // Several events can attempt to move the same object. Only one of those moves can succeed.
        const byCard = Map.groupBy(events.map(event => event.timestampAssignment).filter(value => value !== undefined),
            assignment => assignment.card);
        if (byCard.size < 2) return resume();
        const assignments = [...byCard.values()].map(([first]) => first);
        // CR 613.7m: Each player orders their objects, in active-player-first turn order.
        const ordered = this.choices.turnOrder().flatMap(player => assignments.filter(item => item.player === player));
        const next = () => {
            const first = ordered[0];
            if (!first) {
                this.commitPending = false;
                return resume();
            }
            const group = ordered.filter(item => item.player === first.player);
            const assign = (item: TimestampAssignment) => {
                const timestamp = this.effects.layers.nextTimestamp();
                for (const assignment of byCard.get(item.card)) assignment.assign(timestamp);
                ordered.splice(ordered.indexOf(item), 1);
                next();
            };
            if (group.length > 1) {
                this.commitPending = true;
                this.chooseTimestamp(first.player, group.map(item => item.card),
                    card => assign(group.find(item => item.card === card)));
            } else assign(first);
        };
        next();
    }

    private getGameListeners(event: GameEvent): Listener[] {
        // 603.7a: A registration made during dispatch starts with a later event.
        return [event.type, GameEventType.All].flatMap(type => [...(this.gameListenersByType.get(type) ?? [])]
            .flatMap(subscription => "notify" in subscription ? [subscription.notify] : []));
    }

    private captureGameListeners(pending: readonly GameEvent[]): CapturedListeners {
        // 603.10: Capture look-back subscriptions before any event in the batch changes the game state.
        const captured = new Map<GameEventType, Listener[]>();
        for (const [type, subscriptions] of this.gameListenersByType) {
            const lookbacks = [...subscriptions].filter(subscription => "capture" in subscription);
            if (!lookbacks.length)
                continue;
            const candidates = pending.filter(event => type === GameEventType.All || type === event.type);
            if (candidates.length)
                captured.set(type, lookbacks.map(subscription => subscription.capture(candidates)));
        }
        return captured;
    }

    private notifyCapturedListeners(performed: readonly GameEvent[], captured: CapturedListeners) {
        if (!captured.size)
            return;

        for (const event of performed) {
            for (const type of [event.type, GameEventType.All]) {
                for (const listener of captured.get(type) ?? [])
                    listener(event);
            }
        }
    }

    private notifyPerformed(event: GameEvent, gameListeners = this.getGameListeners(event)) {
        for (const listener of gameListeners)
            listener(event);

        this.eventPerformedListenersByType.get(event.type)?.forEach(listener => listener(event));
        this.eventPerformedListenersByType.get(GameEventType.All)?.forEach(listener => listener(event));

        console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
        event.callback?.();
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;
