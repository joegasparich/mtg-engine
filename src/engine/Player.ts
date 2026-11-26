import Card from "@engine/Card";
import { CardObject } from "@engine/GameObject";
import { Battlefield,Graveyard,Hand,Library } from "@engine/Zone";
import { ManaAmount,ManaUtility } from "@engine/mana";
import { cardData } from "~/index";

export default class Player {
    id: number;

    life = 20;
    manaPool: ManaAmount = [0, 0, 0, 0, 0, 0];
    lastTurnStartedAt = -1;

    library: Library = new Library();
    hand: Hand = new Hand();
    battlefield: Battlefield = new Battlefield();
    graveyard: Graveyard = new Graveyard();

    zones = [
        this.library,
        this.hand,
        this.battlefield,
        this.graveyard,
    ];

    constructor(id: number, deck: number[]) {
        this.id = id;
        for (const index of deck)
            this.library.onEnter(new CardObject(new Card(cardData[index], this)));
    }

    getPotentialMana(reservedManaSource?: CardObject): Readonly<ManaAmount> {
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        for (const permanent of this.battlefield.objects) {
            if (permanent !== reservedManaSource)
                ManaUtility.addMana(potentialMana, permanent.getPotentialMana(this));
        }

        return potentialMana;
    }

}
