import { AbilityPart_Banding } from "@engine/abilities/parts/AbilityPart_Banding";
import { GameEvent_CheckCombatDamageChooser } from "@engine/events/GameEvent_CombatDamageChoice";
import { Permanent } from "@engine/GameObject";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import gameEventManager,{ GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { StepIndex } from "@engine/Step";
import { CardType } from "~/defs";

export class CombatManager {
    static attackingPlayer: Player;
    static readonly attackingCreatures = new Map<Permanent, Player>();
    static readonly blockingCreatures = new Map<Permanent, Permanent>();
    private static bands: Set<Permanent>[] = [];
    private static readonly effectiveBlocks = new Map<Permanent, Set<Permanent>>();
    private static readonly blockedAttackers = new Set<Permanent>();
    private static attackersConfirmed = false;
    private static blocksConfirmed = false;

    static get attackingBands(): readonly ReadonlySet<Permanent>[] { return this.bands; }

    static reset() {
        CombatManager.attackingPlayer = null;
        CombatManager.attackingCreatures.clear();
        CombatManager.blockingCreatures.clear();
        CombatManager.bands = [];
        CombatManager.effectiveBlocks.clear();
        CombatManager.blockedAttackers.clear();
        CombatManager.attackersConfirmed = false;
        CombatManager.blocksConfirmed = false;
    }

    // 506.4: A permanent that leaves the battlefield is removed from combat.
    static removeFromCombat(permanent: Permanent) {
        CombatManager.blockingCreatures.delete(permanent);
        CombatManager.effectiveBlocks.delete(permanent);
        if (!CombatManager.attackingCreatures.delete(permanent))
            return false;

        const bandIndex = CombatManager.bands.findIndex(band => band.has(permanent));
        if (bandIndex !== -1) {
            // 702.22e–f: A confirmed band persists when its banding creature leaves combat.
            const band = CombatManager.bands[bandIndex];
            band.delete(permanent);
            if (!band.size || (!CombatManager.attackersConfirmed && !AbilityPart_Banding.allowsBand(band)))
                CombatManager.bands.splice(bandIndex, 1);
        }

        CombatManager.blockedAttackers.delete(permanent);
        for (const [blocker, attacker] of CombatManager.blockingCreatures) {
            if (attacker === permanent)
                CombatManager.blockingCreatures.delete(blocker);
        }
        for (const attackers of CombatManager.effectiveBlocks.values())
            attackers.delete(permanent);
        return true;
    }

    static canSetAttackingBands(player: Player, groups: readonly (readonly Permanent[])[]): boolean {
        return game.currentStepIndex === StepIndex.DeclareAttackers && !game.hasPendingPlayerInput
            && player === game.activePlayer() && player === CombatManager.attackingPlayer
            && !CombatManager.attackersConfirmed && CombatManager.validBands(player, groups);
    }

    static setAttackingBands(player: Player, groups: readonly (readonly Permanent[])[]): boolean {
        if (!CombatManager.canSetAttackingBands(player, groups))
            return false;

        CombatManager.bands = groups.map(group => new Set(group));
        return true;
    }

    private static validBands(player: Player, groups: readonly Iterable<Permanent>[]): boolean {
        const assigned = new Set<Permanent>();
        for (const group of groups) {
            const members = new Set<Permanent>();
            let defender: Player;
            for (const member of group) {
                const target = CombatManager.attackingCreatures.get(member);
                if (!target || member.controller !== player || assigned.has(member) || (defender && defender !== target))
                    return false;

                defender = target;
                assigned.add(member);
                members.add(member);
            }
            if (!AbilityPart_Banding.allowsBand(members))
                return false;
        }
        return true;
    }

    static canConfirmAttackers() {
        return CombatManager.validBands(CombatManager.attackingPlayer, CombatManager.bands);
    }

    static confirmAttackers() {
        CombatManager.attackersConfirmed = true;
    }

    static confirmBlocks() {
        if (CombatManager.blocksConfirmed)
            return;

        for (const [blocker, attacker] of CombatManager.blockingCreatures)
            CombatManager.markBlocked(attacker, blocker);
        CombatManager.blocksConfirmed = true;
    }

    private static bandMembers(attacker: Permanent): Iterable<Permanent> {
        return CombatManager.bands.find(band => band.has(attacker)) ?? [attacker];
    }

    // 702.22h–i: A declared blocker or an effect that makes a creature blocked applies to its whole band.
    static markBlocked(attacker: Permanent, blocker?: Permanent) {
        if (!CombatManager.attackingCreatures.has(attacker))
            return;

        const members = CombatManager.bandMembers(attacker);
        for (const member of members)
            CombatManager.blockedAttackers.add(member);

        if (blocker) {
            const blocked = CombatManager.effectiveBlocks.get(blocker) ?? new Set<Permanent>();
            for (const member of members)
                blocked.add(member);
            CombatManager.effectiveBlocks.set(blocker, blocked);
        }
    }

    static isBlocked(attacker: Permanent) {
        return CombatManager.blockedAttackers.has(attacker);
    }

    static *blockRelationships(): IterableIterator<[Permanent, Permanent]> {
        if (!CombatManager.blocksConfirmed) {
            for (const [blocker, attacker] of CombatManager.blockingCreatures) {
                for (const member of CombatManager.bandMembers(attacker))
                    yield [blocker, member];
            }
        } else {
            for (const [blocker, attackers] of CombatManager.effectiveBlocks) {
                for (const attacker of attackers)
                    yield [blocker, attacker];
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

    static assignCombatDamage() {
        const blockersByAttacker = new Map<Permanent, Permanent[]>();
        for (const attacker of CombatManager.attackingCreatures.keys())
            blockersByAttacker.set(attacker, []);
        for (const [blocker, attackers] of CombatManager.effectiveBlocks) {
            for (const attacker of attackers)
                blockersByAttacker.get(attacker).push(blocker);
        }

        // 510.1: Assign damage from attackers first, then from blockers.
        const sources = [...blockersByAttacker, ...CombatManager.effectiveBlocks];
        const damage = new Map<Permanent, number>();
        let index = 0;
        const addDamage = (recipient: Permanent, amount: number) =>
            damage.set(recipient, (damage.get(recipient) ?? 0) + amount);

        const assignNext = () => {
            while (index < sources.length) {
                const [source, opponents] = sources[index++];
                const recipients = [...opponents];
                const total = source.power;
                if (total <= 0 || !recipients.length)
                    continue;
                if (recipients.length === 1) {
                    addDamage(recipients[0], total);
                    continue;
                }

                const chooser = new GameEvent_CheckCombatDamageChooser(source, recipients);
                gameEventManager.checkEvent(chooser);
                game.requestCombatDamageChoice({ player: chooser.player, source, recipients, total }, amounts => {
                    recipients.forEach((recipient, i) => addDamage(recipient, amounts[i]));
                    assignNext();
                });
                return;
            }

            // 510.2: Deal all assigned damage before the next state-based action check.
            for (const [recipient, amount] of damage)
                recipient.damageTaken += amount;
        };
        assignNext();
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
