import type { CardObject,Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { Zone } from "@engine/Zone";
import type { GameEvent_ChangeCardZone } from "./GameEvent_ChangeCardZone";
import type { GameEvent } from "./GameEventManager";

export enum RulesEventType {
    Attacks,
    BecomesTapped,
    ZoneChanged,
}

export interface ZoneChanged {
    readonly type: RulesEventType.ZoneChanged;
    readonly oldObject: CardObject;
    readonly oldZone?: Zone;
    readonly newObject: CardObject;
    readonly newZone: Zone;
    readonly cause: GameEvent_ChangeCardZone;
}

interface BecomesTapped {
    readonly type: RulesEventType.BecomesTapped;
    readonly permanent: Permanent;
}

interface Attacks {
    readonly type: RulesEventType.Attacks;
    readonly attacker: Permanent;
    readonly defender: Player;
}

export type RulesEvent = ZoneChanged | BecomesTapped | Attacks;
type EventOfType<T extends RulesEventType> = Extract<RulesEvent, { type: T }>;
export type RecordRulesEvent = (event: RulesEvent) => void;
export type RulesBatchListener = (events: readonly RulesEvent[]) => void;
type PrepareListener = (actions: readonly GameEvent[]) => RulesBatchListener | undefined;

function hasType<T extends RulesEventType>(event: RulesEvent, type: T): event is EventOfType<T> {
    return event.type === type;
}

export class RulesEventStream {
    private readonly listeners = new Set<RulesBatchListener>();
    private readonly applicationListeners = new Set<RulesBatchListener>();
    private readonly preparations = new Set<PrepareListener>();

    reset() {
        this.listeners.clear();
        this.preparations.clear();
    }

    // CR 700.1, 603.2c: A trigger can match individual occurrences or the whole simultaneous event.
    onBatch(listener: RulesBatchListener) {
        const notify: RulesBatchListener = events => listener(events);
        this.listeners.add(notify);
        return () => { this.listeners.delete(notify); };
    }

    on<T extends RulesEventType>(type: T, listener: (event: EventOfType<T>) => void,
        options?: { acrossGames?: boolean; matches?: (event: EventOfType<T>) => boolean }) {
        const listeners = options?.acrossGames ? this.applicationListeners : this.listeners;
        const notify: RulesBatchListener = events => {
            for (const event of events) {
                if (hasType(event, type) && options?.matches?.(event) !== false)
                    listener(event);
            }
        };
        listeners.add(notify);
        return () => { listeners.delete(notify); };
    }

    beforeBatch(prepare: PrepareListener) {
        this.preparations.add(prepare);
        return () => { this.preparations.delete(prepare); };
    }

    capture(actions: readonly GameEvent[]) {
        return [...this.preparations].map(prepare => prepare(actions)).filter(notify => notify !== undefined);
    }

    publish(events: readonly RulesEvent[], captured: readonly RulesBatchListener[]) {
        if (!events.length) return;
        // CR 603.10: Usually the listeners in effect after the event see it, including newly entered permanents.
        for (const notify of [...captured, ...this.listeners, ...this.applicationListeners])
            notify(events);
    }
}
