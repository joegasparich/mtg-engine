import * as PIXI from "pixi.js";

import Card from "../engine/Card";
import {drawArrow} from "./drawUtility";
import {pixi} from "./UIRoot";
import {uiRoot} from "../engine/root";
import {autobind} from "../utility/typeUtility";
import UICard from "./UICard";

export enum UIEventType {
    CardClicked,
    CardSelected,
    CardDeselected,
    StartTargeting,
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

export class UIEvent_StartTargeting extends UIEvent {
    source: UICard;
    target: UICard | null;

    validateTarget: (card: Card) => boolean;
    onTargeted: (card: Card) => void;
    onCancelled: () => void;

    arrow: PIXI.Graphics;

    constructor(card: Card, validateTarget: (card: Card) => boolean, onTargeted: (card: Card) => void, onCancelled: () => void | null) {
        super();

        this.type = UIEventType.StartTargeting;
        this.label = `Card ${card.name} started targeting`;
        this.source = uiRoot.cardToUICard.get(card);
        this.validateTarget = validateTarget;
        this.onTargeted = onTargeted;
        this.onCancelled = onCancelled;

        this.arrow = new PIXI.Graphics();
        this.arrow.eventMode = "none";
        pixi.stage.addChild(this.arrow);

        this.arrow.onRender = (renderer: PIXI.Renderer) => {
            const p1 = this.source.getGlobalPosition();
            const p2 = this.target ? this.target.getGlobalPosition() : uiRoot.mousePos;

            drawArrow(this.arrow, p1, p2, {
                color: 0xff0000,
                lineWidth: 5,
                arrowheadLength: 25,
                arrowheadAngle: Math.PI / 6,
                alpha: 0.8
            });
        }

        uiEventManager.on(UIEventType.CardClicked, (event: UIEvent_CardClicked) => this.onCardClicked(event.card));
    }

    @autobind
    onCardClicked(card: Card) {
        if (this.validateTarget(card))
            this.target = uiRoot.cardToUICard.get(card);
    }

    remove() {
        pixi.stage.removeChild(this.arrow);
        uiEventManager.off(UIEventType.CardClicked, (event: UIEvent_CardClicked) => this.onCardClicked(event.card));
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
        console.log(`%cUIEvent: ${event.label}`, "color: yellow;");
        this.listeners.get(event.type)?.forEach(listener => listener(event));
    }
}

const uiEventManager = new UIEventManager();
export default uiEventManager;