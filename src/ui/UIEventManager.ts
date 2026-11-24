import type { CardObject } from "@engine/GameObject";

export enum UIEventType {
    CardClicked,
    CardSelected,
    CardDeselected,
}

export abstract class UIEvent {
    type: UIEventType;
    label: string;
}

export class UIEvent_Simple extends UIEvent {
    constructor(type: UIEventType, label: string) {
        super();

        this.type = type;
        this.label = label;
    }
}

export class UIEvent_CardClicked extends UIEvent {
    object: CardObject;

    constructor(object: CardObject) {
        super();

        this.type = UIEventType.CardClicked;
        this.label = `Card ${object.logName} clicked`;
        this.object = object;
    }
}

export class UIEvent_CardSelected extends UIEvent {
    object: CardObject;

    constructor(object: CardObject) {
        super();

        this.type = UIEventType.CardSelected;
        this.label = `Card ${object.logName} selected`;
        this.object = object;
    }
}

export class UIEvent_CardDeselected extends UIEvent {
    object: CardObject;

    constructor(object: CardObject) {
        super();

        this.type = UIEventType.CardDeselected;
        this.label = `Card ${object.logName} deselected`;
        this.object = object;
    }
}

type Listener = (event: UIEvent) => void;

class UIEventManager {
    private readonly listeners = new Map<UIEventType, Set<Listener>>();

    on(eventType: UIEventType, listener: Listener) {
        if (!this.listeners.has(eventType))
            this.listeners.set(eventType, new Set<Listener>());

        this.listeners.get(eventType).add(listener);
    }

    off(eventType: UIEventType, listener: Listener) {
        this.listeners.get(eventType)?.delete(listener);
    }

    fire(event: UIEvent) {
        console.log(`%cUIEvent: ${event.label}`, "color: yellow;");
        this.listeners.get(event.type)?.forEach(listener => listener(event));
    }
}

const uiEventManager = new UIEventManager();
export default uiEventManager;
