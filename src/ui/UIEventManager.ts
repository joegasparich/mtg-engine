import Card from "../engine/Card";

export enum UIEventType {
    CardClicked,
    CardSelected,
    CardDeselected
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
    card: Card;

    constructor(card: Card) {
        super();

        this.type = UIEventType.CardClicked;
        this.label = `Card ${card.name} clicked`;
        this.card = card;
    }
}

export class UIEvent_CardSelected extends UIEvent {
    card: Card;

    constructor(card: Card) {
        super();

        this.type = UIEventType.CardSelected;
        this.label = `Card ${card.name} selected`;
        this.card = card;
    }
}

export class UIEvent_CardDeselected extends UIEvent {
    card: Card;

    constructor(card: Card) {
        super();

        this.type = UIEventType.CardDeselected;
        this.label = `Card ${card.name} deselected`;
        this.card = card;
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
        this.listeners.get(eventType).delete(listener);
    }

    fire(event: UIEvent) {
        console.log(`%UIEvent: ${event.label}`, "color: yellow;");
        this.listeners.get(event.type)?.forEach(listener => listener(event));
    }
}

const uiEventManager = new UIEventManager();
export default uiEventManager;