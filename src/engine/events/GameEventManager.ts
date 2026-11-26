import type { Ability } from "@engine/abilities";
import type { DamagePreventionChoices } from "@engine/effects/DamagePrevention";
import { type CheckListener,type CheckRemovalOverride,type CheckSource,type ContinuousEffect,EffectSystem,EventCheckPhase,type OneShotEffect } from "@engine/effects/EffectSystem";
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
    CheckCharacteristics,
    CheckPowerToughness,
    RegeneratePermanent,
    TakeSpecialAction,
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    effect?: OneShotEffect;
    readonly duringDamagePrevention?: boolean;
    callback: () => void;

    get additionalPerformedTypes(): readonly GameEventType[] { return []; }

    perform(): boolean {
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
type GameSubscription = { notify: Listener } | { capture: () => Listener };
type CapturedListeners = ReadonlyMap<GameEventType, readonly Listener[]>;

function isDamage(event: GameEvent): event is GameEvent_DealDamage {
    return event.type === GameEventType.DealDamage;
}

interface GameSubscriptionOptions<T extends GameEvent> {
    once?: boolean;
    matches?: (event: T) => boolean;
}

class GameEventManager {
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
    private damageChoices: DamagePreventionChoices;
    private damagePending = false;
    private currentBatch: GameEvent[] = [];

    startGame(settle: () => boolean, waitingForChoice: () => boolean, advanceWhileIdle: () => boolean,
        damageChoices: DamagePreventionChoices) {
        for (const listeners of this.gameListenersByType.values())
            listeners.clear();
        this.gameListenersByType.clear();
        this.effects.endContinuousEffects();
        this.activeEvents.length = 0;
        this.currentBatch.length = 0;
        this.damagePending = false;
        this.eventsResolvedCallback.length = 0;
        this.resolutionSteps.length = 0;
        this.idleCallbacks.length = 0;
        this.settleState = settle;
        this.waitingForChoice = waitingForChoice;
        this.advanceWhileIdle = advanceWhileIdle;
        this.damageChoices = damageChoices;
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
        options: GameSubscriptionOptions<T> & { captureBeforeBatch: () => State }): () => void;
    onGamePerformed<T extends GameEvent>(eventType: GameEventType, listener: (event: T) => void,
        options?: GameSubscriptionOptions<T>): () => void;
    onGamePerformed<T extends GameEvent, State>(eventType: GameEventType, listener: (event: T, state?: State) => void,
        { once, matches, captureBeforeBatch }: GameSubscriptionOptions<T> & { captureBeforeBatch?: () => State } = {}): () => void {
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
            capture: () => {
                const state = captureBeforeBatch();
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
        if (this.damagePending) {
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
            if (this.damagePending) {
                this.currentBatch.unshift(...events.slice(index + 1));
                break;
            }
        }
        return performed;
    }

    performSimultaneous(events: GameEvent[]): boolean {
        if (this.damagePending) {
            const batch = [...events];
            this.onResolved(() => this.performSimultaneous(batch));
            return false;
        }

        this.checkForEffects(events);
        if (events.some(isDamage)) {
            let performed = false;
            const prepared = events.flatMap(event => this.prepareEvent(event).events);
            this.commitPrepared(prepared, (results, _, captured) => { performed = this.notifySimultaneous(results, captured); });
            return performed;
        }

        const captured = this.captureGameListeners();
        const performed = events.flatMap(event => this.prepareEvent(event).events.filter(pending => pending.perform()));
        return this.notifySimultaneous(performed, captured);
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
                if (this.damagePending) {
                    // 510.2: Suspend the whole damage batch while processing its choice events.
                    const index = this.activeEvents.findIndex(event => event.duringDamagePrevention);
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
            const captured = this.captureGameListeners();
            const performed: GameEvent[] = [];
            let checkedPerformed = false;
            let hitIndex = 0;
            for (const event of events) {
                const actual = damage && isDamage(event) ? damage[hitIndex++] : [event];
                for (const portion of actual) {
                    if (portion.perform()) {
                        performed.push(portion);
                        checkedPerformed ||= event === checked;
                    }
                }
            }
            // 615.5: Additional prevention effects follow the damage event, before priority or state checks.
            for (const followUp of afterDamage)
                followUp();
            notify(performed, checkedPerformed, captured);
        };

        const hits = events.filter(isDamage);
        if (!hits.length) {
            commit();
            return;
        }

        this.damagePending = true;
        this.effects.damagePrevention.resolve(hits, this.damageChoices, (damage, afterDamage) => {
            this.damagePending = false;
            commit(damage, afterDamage);
        });
    }

    private getGameListeners(event: GameEvent): Listener[] {
        // 603.7a: A registration made during dispatch starts with a later event.
        return [...this.getPerformedTypes(event)].flatMap(type => [...(this.gameListenersByType.get(type) ?? [])]
            .flatMap(subscription => "notify" in subscription ? [subscription.notify] : []));
    }

    private captureGameListeners(): CapturedListeners {
        // 603.10: Capture look-back subscriptions before any event in the batch changes the game state.
        const captured = new Map<GameEventType, Listener[]>();
        for (const [type, subscriptions] of this.gameListenersByType) {
            const listeners = [...subscriptions].flatMap(subscription => "capture" in subscription ? [subscription.capture()] : []);
            if (listeners.length)
                captured.set(type, listeners);
        }
        return captured;
    }

    private notifyCapturedListeners(performed: readonly GameEvent[], captured: CapturedListeners) {
        if (!captured.size)
            return;

        for (const event of performed) {
            for (const type of this.getPerformedTypes(event)) {
                for (const listener of captured.get(type) ?? [])
                    listener(event);
            }
        }
    }

    private getPerformedTypes(event: GameEvent) {
        return new Set([event.type, ...event.additionalPerformedTypes, GameEventType.All]);
    }

    private notifyPerformed(event: GameEvent, gameListeners = this.getGameListeners(event)) {
        for (const listener of gameListeners)
            listener(event);

        this.eventPerformedListenersByType.get(event.type)?.forEach(listener => listener(event));
        for (const type of event.additionalPerformedTypes)
            this.eventPerformedListenersByType.get(type)?.forEach(listener => listener(event));
        this.eventPerformedListenersByType.get(GameEventType.All)?.forEach(listener => listener(event));

        console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
        event.callback?.();
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;
