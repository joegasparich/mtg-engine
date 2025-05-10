import Card from "./Card";
import {CardType} from "../defs";
import {Battlefield} from "./Zone";
import Player from "./Player";

export namespace CombatManager {
    export let attackingPlayer: Player;
    export const attackingCreatures = new Map<Card, Player>();
    export const blockingCreatures = new Map<Card, Card>();

    export function reset() {
        attackingPlayer = null;
        attackingCreatures.clear();
        blockingCreatures.clear();
    }

    export function canAttack(card: Card) {
        if (card.controller !== attackingPlayer)
            return false;

        if (!(card.zone instanceof Battlefield))
            return false;

        if (card.type != CardType.Creature)
            return false;

        if (card.tapped)
            return false;

        return true;
    }

    export function canBlock(card: Card) {
        if (!beingAttacked(card.controller))
            return false;

        if (!(card.zone instanceof Battlefield))
            return false;

        if (card.type != CardType.Creature)
            return false;

        if (card.tapped)
            return false;

        return true;
    }

    export function beingAttacked(player: Player) {
        for (let card of attackingCreatures.keys()) {
            if (attackingCreatures.get(card) == player)
                return true;
        }

        return false;
    }
}