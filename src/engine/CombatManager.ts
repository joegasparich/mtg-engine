import { Permanent } from "@engine/GameObject";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import gameEventManager,{ GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { CardType } from "~/defs";

export class CombatManager {
    static attackingPlayer: Player;
    static readonly attackingCreatures = new Map<Permanent, Player>();
    static readonly blockingCreatures = new Map<Permanent, Permanent>();

    static reset() {
        CombatManager.attackingPlayer = null;
        CombatManager.attackingCreatures.clear();
        CombatManager.blockingCreatures.clear();
    }

    // 506.4: A permanent that leaves the battlefield is removed from combat.
    static removeFromCombat(permanent: Permanent) {
        CombatManager.blockingCreatures.delete(permanent);
        if (CombatManager.attackingCreatures.delete(permanent)) {
            for (const [blocker, attacker] of CombatManager.blockingCreatures) {
                if (attacker === permanent)
                    CombatManager.blockingCreatures.delete(blocker);
            }
        }
    }

    static canAttack(attacker: Permanent) {
        if (attacker.controller !== CombatManager.attackingPlayer)
            return false;

        if (!(attacker.zone instanceof Battlefield))
            return false;

        if (attacker.type != CardType.Creature)
            return false;

        if (attacker.tapped)
            return false;

        // 508.1c: Check restrictions on declaring this creature as an attacker.
        return gameEventManager.checkEvent(new GameEvent_Simple(GameEventType.DeclareAttacker, "", attacker));
    }

    static canBlock(blocker: Permanent) {
        if (!CombatManager.beingAttacked(blocker.controller))
            return false;

        if (!(blocker.zone instanceof Battlefield))
            return false;

        if (blocker.type != CardType.Creature)
            return false;

        if (blocker.tapped)
            return false;

        return true;
    }

    static canBlockAnyAttackers(blocker: Permanent) {
        if (!CombatManager.canBlock(blocker))
            return false;

        for (const attacker of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.canBlockAttacker(blocker, attacker))
                return true;
        }

        return false;
    }

    static canBlockAttacker(blocker: Permanent, attacker: Permanent) {
        // 509.1a: A creature can only block an attacker attacking its controller.
        if (CombatManager.attackingCreatures.get(attacker) !== blocker.controller || !CombatManager.canBlock(blocker))
            return false;

        return gameEventManager.checkEvent(new GameEvent_Simple(GameEventType.DeclareBlocker, "", blocker, attacker));
    }

    static hasAnyAttackers(player: Player): boolean {
        for (const permanent of player.battlefield.objects) {
            if (CombatManager.canAttack(permanent))
                return true;
        }

        return false;
    }

    static hasAnyBlockers(player: Player): boolean {
        for (const permanent of player.battlefield.objects) {
            if (CombatManager.canBlockAnyAttackers(permanent))
                return true;
        }

        return false;
    }

    static beingAttacked(player: Player) {
        for (const attacker of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.attackingCreatures.get(attacker) == player)
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

    static potentialAttackTargetsFor(attacker: Permanent): Player[] {
        return game.players.filter(p => p != attacker.controller);
    }

    static potentialBlockTargetsFor(blocker: Permanent): Permanent[] {
        const blockTargets: Permanent[] = [];

        for (const attacker of CombatManager.attackingCreatures.keys()) {
            if (CombatManager.canBlockAttacker(blocker, attacker))
                blockTargets.push(attacker);
        }

        return blockTargets;
    }
}
