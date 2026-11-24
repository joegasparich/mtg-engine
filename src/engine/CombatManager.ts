import Card from "@engine/Card";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import gameEventManager,{ GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { CardType } from "~/defs";

export class CombatManager {
    static attackingPlayer: Player;
    static readonly attackingCreatures = new Map<Card, Player>();
    static readonly blockingCreatures = new Map<Card, Card>();

    static reset() {
        CombatManager.attackingPlayer = null;
        CombatManager.attackingCreatures.clear();
        CombatManager.blockingCreatures.clear();
    }

    static canAttack(card: Card) {
        if (card.controller !== CombatManager.attackingPlayer)
            return false;

        if (!(card.zone instanceof Battlefield))
            return false;

        if (card.type != CardType.Creature)
            return false;

        if (card.tapped)
            return false;

        return true;
    }

    static canBlock(card: Card) {
        if (!CombatManager.beingAttacked(card.controller))
            return false;

        if (!(card.zone instanceof Battlefield))
            return false;

        if (card.type != CardType.Creature)
            return false;

        if (card.tapped)
            return false;

        return true;
    }

    static canBlockAnyAttackers(card: Card) {
        if (!CombatManager.canBlock(card))
            return false;

        for (const attacker of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.canBlockAttacker(card, attacker))
                return true;
        }

        return false;
    }

    static canBlockAttacker(blocker: Card, attacker: Card) {
        if (!CombatManager.attackingCreatures.has(attacker))
            return false;

        if (!gameEventManager.checkEvent(new GameEvent_Simple(GameEventType.DeclareBlocker, "", blocker, attacker)))
            return false;

        return CombatManager.canBlock(blocker);
    }

    static hasAnyAttackers(player: Player): boolean {
        for (const card of player.battlefield.cards) {
            if (CombatManager.canAttack(card))
                return true;
        }

        return false;
    }

    static hasAnyBlockers(player: Player): boolean {
        for (const card of player.battlefield.cards) {
            if (CombatManager.canBlockAnyAttackers(card))
                return true;
        }

        return false;
    }

    static beingAttacked(player: Player) {
        for (const card of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.attackingCreatures.get(card) == player)
                return true;
        }

        return false;
    }

    static calculateAndAssignDamage() {
        for (const [blocker, attacker] of CombatManager.blockingCreatures) {
            blocker.damageTaken = attacker.power;
            attacker.damageTaken = blocker.power;
        }
    }

    static potentialAttackTargetsFor(attacker: Card): Player[] {
        return game.players.filter(p => p != attacker.controller);
    }

    static potentialBlockTargetsFor(blocker: Card): Card[] {
        const blockTargets: Card[] = [];

        for (const attacker of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.canBlockAttacker(blocker, attacker))
                blockTargets.push(attacker);
        }

        return blockTargets;
    }
}
