import Card from "@engine/Card";
import Player from "@engine/Player";
import {Battlefield} from "@engine/Zone";
import {CardType} from "~/defs";
import {game} from "@engine/Game";
import gameEventManager, {GameEvent_Simple, GameEventType} from "@engine/events/GameEventManager";

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

    export function canBlockAnyAttackers(card: Card) {
        if (!canBlock(card))
            return false;

        for (const attacker of attackingCreatures.keys()) {
            if (canBlockAttacker(card, attacker))
                return true;
        }

        return false;
    }

    export function canBlockAttacker(blocker: Card, attacker: Card) {
        if (!attackingCreatures.has(attacker))
            return false;

        if (!gameEventManager.checkEvent(new GameEvent_Simple(GameEventType.DeclareBlocker, "", blocker, attacker)))
            return false;

        return canBlock(blocker);
    }

    export function hasAnyAttackers(player: Player): boolean {
        for (const card of player.battlefield.cards) {
            if (canAttack(card))
                return true;
        }

        return false;
    }

    export function hasAnyBlockers(player: Player): boolean {
        for (const card of player.battlefield.cards) {
            if (canBlockAnyAttackers(card))
                return true;
        }

        return false;
    }

    export function beingAttacked(player: Player) {
        for (const card of attackingCreatures.keys()) {
            if (attackingCreatures.get(card) == player)
                return true;
        }

        return false;
    }

    export function calculateAndAssignDamage() {
        for (const [blocker, attacker] of blockingCreatures) {
            blocker.damageTaken = attacker.power;
            attacker.damageTaken = blocker.power;
        }
    }

    export function potentialAttackTargetsFor(attacker: Card): Player[] {
        return game.players.filter(p => p != attacker.controller);
    }

    export function potentialBlockTargetsFor(blocker: Card): Card[] {
        const blockTargets: Card[] = [];

        for (const attacker of attackingCreatures.keys()) {
            if (canBlockAttacker(blocker, attacker))
                blockTargets.push(attacker);
        }

        return blockTargets;
    }
}