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
    DeclareAttacker,
    DeclareBlocker,
    StartTargeting,
    PlayLand,
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    isAction = true;
    callback: () => void;

    perform(): boolean {
        return true;
    }
    then(callback: () => void) {
        this.callback = callback;
    }
}

export class GameEvent_Simple extends GameEvent {
    cardA?: Card;
    cardB?: Card;

    constructor(type: GameEventType, label: string, cardA?: Card, cardB?: Card) {
        super();

        this.type = type;
        this.label = label;
        this.cardA = cardA;
        this.cardB = cardB;
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
type CheckListener = (events: GameEvent[]) => void;

class GameEventManager {
    private readonly eventPerformedListenersByType = new Map<GameEventType, Set<Listener>>();
    private readonly eventCheckListeners = new Set<CheckListener>();
    private readonly eventsResolvedCallback: (() => void)[] = [];

    onPerformed(eventType: GameEventType, listener: Listener) {
        if (!this.eventPerformedListenersByType.has(eventType))
            this.eventPerformedListenersByType.set(eventType, new Set<Listener>());

        this.eventPerformedListenersByType.get(eventType).add(listener);
    }

    offPerformed(eventType: GameEventType, listener: Listener) {
        this.eventPerformedListenersByType.get(eventType).delete(listener);
    }

    onCheck(listener: CheckListener) {
        this.eventCheckListeners.add(listener);
    }

    offCheck(listener: CheckListener) {
        this.eventCheckListeners.delete(listener);
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
        const events = [event];
        this.checkForEffects(events);
        return events.length > 0;
    }

    performImmediate(event: GameEvent): boolean {
        return this.checkEvent(event) && this.performEvent(event);
    }

    onResolved(callback: () => void) {
        this.eventsResolvedCallback.push(callback);
        this.performAllEvents();
    }

    checkForEffects(events: GameEvent[]) {
        for (const listener of this.eventCheckListeners) {
            listener(events);
        }
    }

    performAllEvents() {
        // Check if we're currently in the while loop
        if (this.performingEvents)
            return;

        this.performingEvents = true;

        try {
            while (this.activeEvents.length > 0 || this.eventsResolvedCallback.length > 0) {
                if (this.activeEvents.length > 0) {
                    const events = this.activeEvents;
                    this.activeEvents = [];
                    for (const event of events) {
                        this.performEvent(event);
                    }
                } else {
                    this.eventsResolvedCallback.shift()();
                }
            }
        } finally {
            this.performingEvents = false;
        }
    }

    private performEvent(event: GameEvent): boolean {
        if (!event.perform())
            return false;

        this.eventPerformedListenersByType.get(event.type)?.forEach(listener => listener(event));
        this.eventPerformedListenersByType.get(GameEventType.All)?.forEach(listener => listener(event));

        console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
        event.callback?.();
        return true;
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;
