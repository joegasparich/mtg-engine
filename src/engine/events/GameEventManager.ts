export enum GameEventType {
    Log,
    TurnStart,
    StepStart,
    StepEnd,
    CastSpell,
    ChangeCardZone,
    ActivateAbility,
    TapCard,
    UntapCard,
    DrawCard,
}

export abstract class GameEvent {
    type: GameEventType;
    label: string;
    callback: () => void;

    perform() {};
    then(callback: () => void) {
        this.callback = callback;
    }
}

export class GameEvent_Simple extends GameEvent {
    constructor(type: GameEventType, label: string) {
        super();

        this.type = type;
        this.label = label;
    }
}

type Listener = (event: GameEvent) => void;

class GameEventManager {
    private readonly listeners = new Map<GameEventType, Set<Listener>>();

    on(eventType: GameEventType, listener: Listener) {
        if (!this.listeners.has(eventType))
            this.listeners.set(eventType, new Set<Listener>());

        this.listeners.get(eventType).add(listener);
    }

    off(eventType: GameEventType, listener: Listener) {
        this.listeners.get(eventType).delete(listener);
    }

    activeEvents: GameEvent[] = [];
    performingEvents: boolean;

    addEvent(event: GameEvent) {
        this.activeEvents.push(event);
        this.checkForEffects();
        this.performAllEvents();
    }
    addEvents(events: GameEvent[]) {
        this.activeEvents.push(...events);
        this.checkForEffects();
        this.performAllEvents();
    }

    checkForEffects() {
        // This is where various effects can modify or remove events
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
                this.listeners.get(event.type)?.forEach(listener => listener(event));

                console.log(`%cGameEvent: ${event.label}`, "color: cyan;");
                event.callback?.();
            }
        }

        this.performingEvents = false;
    }
}

const gameEventManager = new GameEventManager();
export default gameEventManager;