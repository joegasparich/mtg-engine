import Card from "@engine/Card";

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
    StartTargeting,
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    callback: () => void;

    perform() {}
    then(callback: () => void) {
        this.callback = callback;
    }
}

export class GameEvent_Simple extends GameEvent {
    constructor(type: GameEventType, label: string,) {
        super();

        this.type = type;
        this.label = label;
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
type CheckListener = (event: GameEvent) => boolean;

class GameEventManager {
    private readonly eventPerformedListenersByType = new Map<GameEventType, Set<Listener>>();
    private readonly eventCheckListenersByType = new Map<GameEventType, Set<CheckListener>>();
    private readonly eventsResolvedCallback: (() => void)[] = [];

    onPerformed(eventType: GameEventType, listener: Listener) {
        if (!this.eventPerformedListenersByType.has(eventType))
            this.eventPerformedListenersByType.set(eventType, new Set<Listener>());

        this.eventPerformedListenersByType.get(eventType).add(listener);
    }

    offPerformed(eventType: GameEventType, listener: Listener) {
        this.eventPerformedListenersByType.get(eventType).delete(listener);
    }

    onCheck(eventType: GameEventType, listener: CheckListener) {
        if (!this.eventCheckListenersByType.has(eventType))
            this.eventCheckListenersByType.set(eventType, new Set<CheckListener>());

        this.eventCheckListenersByType.get(eventType).add(listener);
    }

    offCheck(eventType: GameEventType, listener: CheckListener) {
        this.eventCheckListenersByType.get(eventType).delete(listener);
    }

    activeEvents: GameEvent[] = [];
    performingEvents: boolean;

    addEvent(event: GameEvent) {
        this.activeEvents.push(event);
        this.checkForEffects();
        this.performAllEvents();

        if (!this.performingEvents && this.eventsResolvedCallback.length > 0) {
            for (const callback of this.eventsResolvedCallback) {
                callback();
            }
            this.eventsResolvedCallback.length = 0;
        }
    }

    addEvents(events: GameEvent[]) {
        this.activeEvents.push(...events);
        this.checkForEffects();
        this.performAllEvents();
    }

    onResolved(callback: () => void) {
        this.eventsResolvedCallback.push(callback);
    }

    checkForEffects() {
        this.activeEvents.filter(event => {
            for (const listener of this.eventCheckListenersByType.get(event.type) ?? []) {
                if (!listener(event))
                    return false;
            }
            for (const listener of this.eventCheckListenersByType.get(GameEventType.All) ?? []) {
                if (!listener(event))
                    return false;
            }

            return true;
        });
    }

    performAllEvents() {
        // Check if we're currently in the while loop
        if (this.performingEvents)
            return;

        this.performingEvents = true;

        // Performs events, until no new events get added.
        // TODO: Add infinite loop checking (should cause draw?)
        while (this.activeEvents.length > 0) {
            const events = [...this.activeEvents];
            this.activeEvents = [];

            for (let i = 0; i < events.length; i++) {
                const event = events[i];

                event.perform();
                this.eventPerformedListenersByType.get(event.type)?.forEach(listener => listener(event));
                this.eventPerformedListenersByType.get(GameEventType.All)?.forEach(listener => listener(event));

                console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
                event.callback?.();
            }
        }

        this.performingEvents = false;
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;