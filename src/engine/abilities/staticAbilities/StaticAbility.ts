import Card from "../../Card";
import {Keyword} from "../../../defs";

export abstract class StaticAbility {
    card: Card;
    keyword: Keyword;

    constructor(card: Card) {
        this.card = card;
    }

    cleanup(card: Card) {
    }
}