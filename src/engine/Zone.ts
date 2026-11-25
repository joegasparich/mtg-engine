import type { CardObject,GameObject,Permanent } from "@engine/GameObject";
import { shuffleArray } from "@utility/arrayUtility";

export enum ZoneKind {
    Library = "library",
    Hand = "hand",
    Battlefield = "battlefield",
    Graveyard = "graveyard",
    Stack = "stack",
}

export class Zone<T extends GameObject = GameObject> {
    name: string;
    readonly objects: T[] = [];

    onEnter(object: T) {
        if (object.zone || object.retired)
            throw new Error("Only a fresh rules object can enter a zone");
        this.objects.push(object);
        object.enterZone(this);
    }

    onLeave(object: T) {
        const index = this.objects.indexOf(object);
        if (index < 0)
            return;
        this.objects.splice(index, 1);
        object.retire();
    }
}

export class Library extends Zone<CardObject> {
    name = "Library";

    shuffle() {
        shuffleArray(this.objects);
    }

    getTopCard(): CardObject | undefined {
        return this.objects.at(-1);
    }

    getTopXCards(x: number): CardObject[] {
        return x > 0 ? this.objects.slice(-x) : [];
    }
}

export class Battlefield extends Zone<Permanent> {
    name = "Battlefield";
}

export class Hand extends Zone<CardObject> {
    name = "Hand";
}

export class Graveyard extends Zone<CardObject> {
    name = "Graveyard";
}
