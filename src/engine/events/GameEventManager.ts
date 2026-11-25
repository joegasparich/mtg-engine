import type { CardObject } from "@engine/GameObject";
import { removeIf } from "@utility/arrayUtility";
import type { Keyword } from "~/defs";

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
    CastSpell,
    ChangeCardZone,
    ActivateAbility,
    TapCard,
    UntapCard,
    DrawCard,
    DestroyPermanent,
    DeclareAttacker,
    DeclareBlocker,
    StartTargeting,
    PlayLand,
    DetachPermanent,
    SacrificePermanent,
    DiscardCard,
    RequestResolutionChoice,
    SubmitResolutionChoice,
    CheckCombatDamageChooser,
    RequestCombatDamageChoice,
    SubmitCombatDamageChoice,
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    readonly additionalPerformedTypes?: readonly GameEventType[];
    callback: () => void;

    perform(): boolean {
        return true;
    }
    then(callback: () => void) {
        this.callback = callback;
    }
}

export class GameEvent_Simple extends GameEvent {
    objectA?: CardObject;
    objectB?: CardObject;

    constructor(type: GameEventType, label: string, objectA?: CardObject, objectB?: CardObject) {
        super();

        this.type = type;
        this.label = label;
        this.objectA = objectA;
        this.objectB = objectB;
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
export interface EventCheck {
    readonly events: readonly GameEvent[];
    add(event: GameEvent): void;
    replace(event: GameEvent, replacement: GameEvent): void;
    removeWhere(predicate: (event: GameEvent) => boolean): void;
}

type CheckListener = (check: EventCheck) => void;
export type CheckSource = { readonly object: CardObject; readonly keyword?: Keyword };
type CheckRemovalOverride = (event: GameEvent, source: CheckSource) => boolean;

class GameEventManager {
    private readonly eventPerformedListenersByType = new Map<GameEventType, Set<Listener>>();
    private readonly eventCheckListeners = new Map<CheckListener, CheckSource | undefined>();
    private readonly checkRemovalOverrides = new Set<CheckRemovalOverride>();
    private checkSource?: CheckSource;
    private readonly eventsResolvedCallback: (() => void)[] = [];
    private readonly resolutionSteps: (() => void)[] = [];
    private readonly idleCallbacks: (() => void)[] = [];
    private settleState?: () => boolean;
    private waitingForChoice?: () => boolean;

    startGame(settle: () => boolean, waitingForChoice: () => boolean) {
        this.activeEvents.length = 0;
        this.eventsResolvedCallback.length = 0;
        this.resolutionSteps.length = 0;
        this.idleCallbacks.length = 0;
        this.settleState = settle;
        this.waitingForChoice = waitingForChoice;
    }

    onPerformed(eventType: GameEventType, listener: Listener) {
        if (!this.eventPerformedListenersByType.has(eventType))
            this.eventPerformedListenersByType.set(eventType, new Set<Listener>());

        this.eventPerformedListenersByType.get(eventType).add(listener);
    }

    offPerformed(eventType: GameEventType, listener: Listener) {
        this.eventPerformedListenersByType.get(eventType).delete(listener);
    }

    onCheck(listener: CheckListener) {
        if (!this.eventCheckListeners.has(listener))
            this.eventCheckListeners.set(listener, this.checkSource);
    }

    offCheck(listener: CheckListener) {
        this.eventCheckListeners.delete(listener);
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
        this.checkRemovalOverrides.add(override);
    }

    offCheckRemovalOverride(override: CheckRemovalOverride) {
        this.checkRemovalOverrides.delete(override);
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
        return this.checkForEffects([event], event) !== undefined;
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
        const performed = events.filter(event => event.perform());
        performed.forEach(event => this.notifyPerformed(event));
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
        for (const [listener, source] of this.eventCheckListeners) {
            listener({
                events,
                add: event => { events.push(event); },
                replace: (event, replacement) => {
                    const index = events.indexOf(event);
                    if (index < 0 || !this.canRemove(event, source))
                        return;

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
            for (const override of this.checkRemovalOverrides) {
                if (override(event, source))
                    return false;
            }
        }
        return true;
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
                } else {
                    break;
                }
            }
        } finally {
            this.performingEvents = false;
        }
    }

    private performEvent(event: GameEvent): boolean {
        if (!event.perform())
            return false;

        this.notifyPerformed(event);
        return true;
    }

    private notifyPerformed(event: GameEvent) {
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
