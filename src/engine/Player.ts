import {Battlefield, Graveyard, Hand, Library} from "@engine/Zone";
import {ManaAmount, ManaUtility} from "@engine/mana";
import Card from "@engine/Card";
import {cardData} from "~/index";

export default class Player {
    id: number;

    life: 20;
    manaPool: ManaAmount = [0, 0, 0, 0, 0, 0];

    library: Library = new Library();
    hand: Hand = new Hand();
    battlefield: Battlefield = new Battlefield();
    graveyard: Graveyard = new Graveyard();
    // exile: Card[] = [];

    zones = [
        this.library,
        this.hand,
        this.battlefield,
        this.graveyard,
        // this.exile
    ];

    constructor(id: number, deck: number[]) {
        this.id = id;
        this.library.cards = deck.map(i => {
            const card = new Card(cardData[i], this);
            card.zone = this.library;
            return card;
        });
    }

    getPotentialMana(): Readonly<ManaAmount> {
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        for (const card of this.hand.cards) {
            ManaUtility.addMana(potentialMana, card.getPotentialMana(this));
        }

        for (const card of this.battlefield.cards) {
            ManaUtility.addMana(potentialMana, card.getPotentialMana(this));
        }

        return potentialMana;
    }

    checkState() {
        // TODO: Check life and lose
        for (const card of this.hand.cards) {
            card.checkState();
        }

        for (const card of this.battlefield.cards) {
            card.checkState();
        }
    }
}