import type { CardObject } from "@engine/GameObject";

export class UICardSelection<T extends CardObject = CardObject> {
    private cards = new Map<CardObject, T>();
    private selected = new Set<T>();
    private focus?: T;

    constructor(private readonly onToggle: (card: T, selected: boolean) => void, private readonly limit = Infinity) {}

    get count() { return this.selected.size; }
    get selection() { return [...this.selected]; }

    setCards(cards: Iterable<T>, selected: Iterable<T> = []) {
        this.cards = new Map(Array.from(cards, card => [card, card]));
        this.selected = new Set(selected);
        this.focus = this.focusedCard;
    }

    stateFor(object: CardObject): "selected" | "eligible" | undefined {
        const card = this.cards.get(object);
        if (!card || card.retired)
            return;

        if (this.selected.has(card))
            return "selected";
        if (this.count < this.limit)
            return "eligible";
    }

    toggle(object: CardObject): boolean {
        const state = this.stateFor(object);
        if (!state)
            return false;

        const card = this.cards.get(object);
        const selected = state === "eligible";
        if (selected)
            this.selected.add(card);
        else
            this.selected.delete(card);
        this.focus = card;
        this.onToggle(card, selected);
        return true;
    }

    get focusedCard(): T | undefined {
        if (this.stateFor(this.focus))
            return this.focus;

        for (const card of this.cards.values()) {
            if (this.stateFor(card))
                return card;
        }
    }

    moveFocus(direction: number) {
        const cards = [...this.cards.values()].filter(card => this.stateFor(card));
        if (cards.length) {
            const current = cards.indexOf(this.focusedCard);
            this.focus = cards[(current + direction + cards.length) % cards.length];
        }
    }
}
