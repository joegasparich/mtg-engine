import Card from "@engine/Card";
import {shuffleArray} from "@utility/arrayUtility";

export class Zone {
    name: string;
    cards: Card[] = [];

    onEnter(card: Card) {
        this.cards.push(card);
    }

    onLeave(card: Card) {
        this.cards = this.cards.filter(o => o != card);
    }
}

export class Library extends Zone {
    name = "Library";

    shuffle() {
        shuffleArray(this.cards);
    }

    getTopCard(): Card {
        return this.cards[-1];
    }
    getTopXCards(x: number): Card[] {
        return this.cards.slice(-x);
    }
}

export class Battlefield extends Zone {
    name = "Battlefield";
}

export class Hand extends Zone {
    name = "Hand";
}

export class Graveyard extends Zone {
    name = "Graveyard";
}
