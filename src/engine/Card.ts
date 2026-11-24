import type Player from "@engine/Player";
import type { CardDef } from "~/defs";

let cardId = 0;

export default class Card {
    readonly id = cardId++;

    constructor(readonly def: CardDef, readonly owner: Player) {}
}
