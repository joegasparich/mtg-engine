import { type CheckListener,type CheckRemovalOverride,type CheckSource,EffectSystem,EventCheckPhase,type OneShotEffect } from "@engine/effects/EffectSystem";

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
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    effect?: OneShotEffect;
    readonly additionalPerformedTypes?: readonly GameEventType[];
    callback: () => void;

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

interface GameSubscriptionOptions<T extends GameEvent> {
    once?: boolean;
    matches?: (event: T) => boolean;
}

class GameEventManager {
    readonly effects = new EffectSystem(this);
    private readonly eventPerformedListenersByType = new Map<GameEventType, Set<Listener>>();
    private readonly gameListenersByType = new Map<GameEventType, Set<Listener>>();
    private checkSource?: CheckSource;
    private readonly eventsResolvedCallback: (() => void)[] = [];
    private readonly resolutionSteps: (() => void)[] = [];
    private readonly idleCallbacks: (() => void)[] = [];
    private settleState?: () => boolean;
    private waitingForChoice?: () => boolean;
    private advanceWhileIdle?: () => boolean;

    startGame(settle: () => boolean, waitingForChoice: () => boolean, advanceWhileIdle: () => boolean) {
        for (const listeners of this.gameListenersByType.values())
            listeners.clear();
        this.gameListenersByType.clear();
        this.effects.endContinuousEffects();
        this.activeEvents.length = 0;
        this.eventsResolvedCallback.length = 0;
        this.resolutionSteps.length = 0;
        this.idleCallbacks.length = 0;
        this.settleState = settle;
        this.waitingForChoice = waitingForChoice;
        this.advanceWhileIdle = advanceWhileIdle;
    }

    onPerformed(eventType: GameEventType, listener: Listener) {
        if (!this.eventPerformedListenersByType.has(eventType))
            this.eventPerformedListenersByType.set(eventType, new Set<Listener>());

        this.eventPerformedListenersByType.get(eventType).add(listener);
    }

    offPerformed(eventType: GameEventType, listener: Listener) {
        this.eventPerformedListenersByType.get(eventType).delete(listener);
    }

    onGamePerformed<T extends GameEvent>(eventType: GameEventType, listener: (event: T) => void,
        { once, matches }: GameSubscriptionOptions<T> = {}): () => void {
        const listeners = this.gameListenersByType.get(eventType) ?? new Set<Listener>();
        this.gameListenersByType.set(eventType, listeners);

        const notify: Listener = event => {
            if (!listeners.has(notify) || matches?.(event as T) === false)
                return;

            if (once)
                cancel();
            listener(event as T);
        };
        const cancel = () => { listeners.delete(notify); };
        listeners.add(notify);
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
        return !!checked && !!this.effects.checkEvents([checked], checked, EventCheckPhase.PreviewCommit);
    }

    performImmediate(event: GameEvent): boolean {
        const events = [event];
        const checkedEvent = this.checkForEffects(events, event);
        let performed = false;
        for (const pending of events) {
            const result = this.performEvent(pending);
            if (pending === checkedEvent)
                performed = result;
        }
        return performed;
    }

    performSimultaneous(events: GameEvent[]): boolean {
        this.checkForEffects(events);
        // 704.3: Commit the whole batch before any listener observes its results.
        const performed = events.flatMap(event => this.commitEvent(event).performed);
        const notifications = performed.map(event => ({ event, listeners: this.getGameListeners(event) }));
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
                if (this.activeEvents.length > 0) {
                    const events = this.activeEvents;
                    this.activeEvents = [];
                    for (const event of events) {
                        this.performEvent(event);
                    }
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
        const { performed, checked } = this.commitEvent(event);
        for (const pending of performed)
            this.notifyPerformed(pending);
        return performed.includes(checked);
    }

    private commitEvent(event: GameEvent) {
        const events = [event];
        const checked = this.effects.checkEvents(events, event, EventCheckPhase.Commit);
        return { performed: events.filter(pending => pending.perform()), checked };
    }

    private getGameListeners(event: GameEvent): Listener[] {
        // 603.7a: A registration made during dispatch starts with a later event.
        const types = new Set([event.type, ...(event.additionalPerformedTypes ?? []), GameEventType.All]);
        return [...types].flatMap(type => [...(this.gameListenersByType.get(type) ?? [])]);
    }

    private notifyPerformed(event: GameEvent, gameListeners = this.getGameListeners(event)) {
        for (const listener of gameListeners)
            listener(event);

        this.eventPerformedListenersByType.get(event.type)?.forEach(listener => listener(event));
        for (const type of event.additionalPerformedTypes ?? [])
            this.eventPerformedListenersByType.get(type)?.forEach(listener => listener(event));
        this.eventPerformedListenersByType.get(GameEventType.All)?.forEach(listener => listener(event));

        console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
        event.callback?.();
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;
