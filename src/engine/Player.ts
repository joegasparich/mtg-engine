import {PlayerAction} from "./PlayerAction";
import {Battlefield, Graveyard, Hand, Library} from "./Zone";
import Card from "./Card";
import {ManaAmount, ManaUtility} from "./mana";
import {cardData} from "../index";

export default class Player {
    id: number;

    life: 20;
    manaPool: ManaAmount = [0, 0, 0, 0, 0, 0];

    library: Library = new Library();
    hand: Hand = new Hand();
    battlefield: Battlefield = new Battlefield();
    graveyard: Graveyard = new Graveyard();
    // exile: Card[] = [];

    constructor(id: number, deck: number[]) {
        this.id = id;
        this.library.cards = deck.map(i => {
            const card = new Card(cardData[i], this);
            card.zone = this.library;
            return card;
        });
    }

    getActions(factorInPotentialMana = false): PlayerAction[] {
        const actions: PlayerAction[] = [];

        const originalMana: Readonly<ManaAmount> = [...this.manaPool];
        if (factorInPotentialMana)
            ManaUtility.AddMana(this.manaPool, this.getPotentialMana());

        for (const card of this.hand.cards) {
            actions.push(...card.getActions(this, true));
        }

        for (const card of this.battlefield.cards) {
            actions.push(...card.getActions(this, true));
        }

        if (factorInPotentialMana) {
            this.manaPool = [...originalMana];
        }

        return actions;
    }

    hasAnyActions() {
        // TODO: We don't care about mana abilities unless there is something to pay for

        return this.getActions(true).length > 0;
    }

    getPotentialMana(): Readonly<ManaAmount> {
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        for (const card of this.hand.cards) {
            ManaUtility.AddMana(potentialMana, card.getPotentialMana(this))
        }

        for (const card of this.battlefield.cards) {
            ManaUtility.AddMana(potentialMana, card.getPotentialMana(this))
        }

        return potentialMana;
    }

    performAction(action: PlayerAction) {
        action.perform(this);
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