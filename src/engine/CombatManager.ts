import { AbilityPart_Banding } from "@engine/abilities/parts/AbilityPart_Banding";
import { GameEvent_CheckBlockLimit,GameEvent_CheckRequiredAttack,GameEvent_CheckRequiredBlock,GameEvent_DeclareAttacker,GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import { GameEvent_AttackersDeclared } from "@engine/events/GameEvent_AttackersDeclared";
import { GameEvent_TapAttacker } from "@engine/events/GameEvent_TapCard";
import { GameEvent_CheckCombatDamageChooser } from "@engine/events/GameEvent_CombatDamageChoice";
import { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import { Permanent } from "@engine/GameObject";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import gameEventManager from "@engine/events/GameEventManager";
import { CardType,Keyword } from "~/defs";

export class CombatManager {
    static attackingPlayer: Player;
    static readonly attackingCreatures = new Map<Permanent, Player>();
    static readonly blockingCreatures = new Map<Permanent, Set<Permanent>>();
    private static bands: Set<Permanent>[] = [];
    private static readonly effectiveBlocks = new Map<Permanent, Set<Permanent>>();
    private static readonly blockedAttackers = new Set<Permanent>();
    private static readonly firstStrikeSources = new Set<Permanent>();
    private static attackersConfirmed = false;
    static declaredAnyAttackers = false;
    private static blocksConfirmed = false;

    static get attackingBands(): readonly ReadonlySet<Permanent>[] { return this.bands; }
    static get defendingPlayer(): Player | null {
        return this.attackingPlayer && game.players.length > 1 ? game.randomOpponent(this.attackingPlayer) : null;
    }

    static reset() {
        CombatManager.attackingPlayer = null;
        CombatManager.attackingCreatures.clear();
        CombatManager.blockingCreatures.clear();
        CombatManager.bands = [];
        CombatManager.effectiveBlocks.clear();
        CombatManager.blockedAttackers.clear();
        CombatManager.firstStrikeSources.clear();
        CombatManager.attackersConfirmed = false;
        CombatManager.declaredAnyAttackers = false;
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
        for (const [blocker, attackers] of CombatManager.blockingCreatures) {
            if (attackers.delete(permanent) && !attackers.size)
                CombatManager.blockingCreatures.delete(blocker);
        }
        for (const attackers of CombatManager.effectiveBlocks.values())
            attackers.delete(permanent);
        return true;
    }

    static canSetAttackingBands(player: Player, groups: readonly (readonly Permanent[])[]): boolean {
        return !game.hasPendingPlayerInput && player === game.declarationPlayer && player === CombatManager.attackingPlayer
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
        const player = CombatManager.attackingPlayer;
        const defender = CombatManager.defendingPlayer;
        if (!CombatManager.validBands(player, CombatManager.bands)) return false;
        if (!defender) return true;

        // 508.1c–d: An attack requirement can only compel a legal attack.
        for (const creature of player.battlefield.objects) {
            if (CombatManager.attackingCreatures.has(creature) || !CombatManager.canAttack(creature, defender))
                continue;
            const check = new GameEvent_CheckRequiredAttack(creature);
            gameEventManager.checkEvent(check);
            if (check.required) return false;
        }
        return true;
    }

    static confirmAttackers() {
        CombatManager.attackersConfirmed = true;
        const attacks = new Map(CombatManager.attackingCreatures);
        CombatManager.declaredAnyAttackers = attacks.size > 0;
        if (attacks.size) {
            // 508.1f, 508.1m: Tap attackers and report the completed declaration, including vigilant attackers.
            gameEventManager.performSimultaneous([
                ...Array.from(attacks.keys(), attacker => new GameEvent_TapAttacker(attacker)),
                new GameEvent_AttackersDeclared(attacks),
            ]);
        }
    }

    static blockLimit(blocker: Permanent): number {
        const check = new GameEvent_CheckBlockLimit(blocker);
        gameEventManager.checkEvent(check);
        return check.maxAttackers;
    }

    static assignBlock(blocker: Permanent, attacker: Permanent) {
        if (!CombatManager.canBlockAttacker(blocker, attacker))
            return;

        const limit = CombatManager.blockLimit(blocker);
        const assigned = CombatManager.blockingCreatures.get(blocker) ?? new Set<Permanent>();
        if (limit === 1) {
            assigned.clear();
        } else if (assigned.size >= limit) {
            return;
        }
        assigned.add(attacker);
        CombatManager.blockingCreatures.set(blocker, assigned);
    }

    static canConfirmBlocks(): boolean {
        const defender = CombatManager.defendingPlayer;
        if (!defender)
            return true;

        for (const blocker of defender.battlefield.objects) {
            const limit = CombatManager.blockLimit(blocker);
            const assigned = CombatManager.blockingCreatures.get(blocker);
            const legal = CombatManager.potentialBlockTargetsFor(blocker);
            // 509.1a–b: Each declared block must obey the creature's limit and restrictions.
            if (assigned && (assigned.size > limit || [...assigned].some(attacker => !legal.includes(attacker))))
                return false;

            const required = legal.filter(attacker => {
                const check = new GameEvent_CheckRequiredBlock(blocker, attacker);
                gameEventManager.checkEvent(check);
                return check.required;
            });
            // 509.1c: Satisfy as many requirements as restrictions allow.
            if (required.filter(attacker => assigned?.has(attacker)).length < Math.min(limit, required.length))
                return false;
        }
        return true;
    }

    static confirmBlocks() {
        if (CombatManager.blocksConfirmed)
            return;

        for (const [blocker, attackers] of CombatManager.blockingCreatures) {
            for (const attacker of attackers)
                CombatManager.markBlocked(attacker, blocker);
        }
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

    static isUnblocked(creature: Permanent): boolean {
        // 509.1h: An attacker becomes unblocked only after blockers have been declared.
        return CombatManager.blocksConfirmed && CombatManager.attackingCreatures.has(creature)
            && !CombatManager.isBlocked(creature);
    }

    static isBlocking(creature: Permanent): boolean {
        // 509.1g: A declared blocker remains a blocker even if every attacker it blocked leaves combat.
        return CombatManager.effectiveBlocks.has(creature);
    }

    static *blockRelationships(): IterableIterator<[Permanent, Permanent]> {
        if (!CombatManager.blocksConfirmed) {
            for (const [blocker, attackers] of CombatManager.blockingCreatures) {
                const members = new Set([...attackers].flatMap(attacker => [...CombatManager.bandMembers(attacker)]));
                for (const member of members)
                    yield [blocker, member];
            }
        } else {
            for (const [blocker, attackers] of CombatManager.effectiveBlocks) {
                for (const attacker of attackers)
                    yield [blocker, attacker];
            }
        }
    }

    static canAttack(attacker: Permanent, defender = CombatManager.defendingPlayer) {
        if (attacker.controller !== CombatManager.attackingPlayer)
            return false;

        if (!(attacker.zone instanceof Battlefield))
            return false;

        if (!attacker.hasType(CardType.Creature))
            return false;

        // 302.6: Count continuous control of the permanent, including time before it was a creature.
        if (attacker.tapped || !attacker.controlledSinceTurnStart)
            return false;

        // 508.1c: Check restrictions on declaring this creature as an attacker.
        return gameEventManager.checkEvent(new GameEvent_DeclareAttacker(attacker, defender));
    }

    static canBlock(blocker: Permanent) {
        if (!CombatManager.beingAttacked(blocker.controller))
            return false;

        if (!(blocker.zone instanceof Battlefield))
            return false;

        if (!blocker.hasType(CardType.Creature))
            return false;

        if (blocker.tapped)
            return false;

        return true;
    }

    static canBlockAnyAttackers(blocker: Permanent) {
        if (!CombatManager.canBlock(blocker) || CombatManager.blockLimit(blocker) <= 0)
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

        return gameEventManager.checkEvent(new GameEvent_DeclareBlocker(blocker, attacker));
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

    static prepareFirstStrikeDamage(): boolean {
        // 510.4: Use the keywords at the start of the step, even if a creature assigns no damage.
        const creatures = [...CombatManager.attackingCreatures.keys(), ...CombatManager.effectiveBlocks.keys()];
        CombatManager.firstStrikeSources.clear();
        for (const creature of creatures) {
            if (creature.hasKeyword(Keyword.FirstStrike) || creature.hasKeyword(Keyword.DoubleStrike))
                CombatManager.firstStrikeSources.add(creature);
        }
        return CombatManager.firstStrikeSources.size > 0;
    }

    static assignCombatDamage(firstStrike = false) {
        const blockersByAttacker = new Map<Permanent, Permanent[]>();
        for (const attacker of CombatManager.attackingCreatures.keys())
            blockersByAttacker.set(attacker, []);
        for (const [blocker, attackers] of CombatManager.effectiveBlocks) {
            for (const attacker of attackers)
                blockersByAttacker.get(attacker).push(blocker);
        }

        // 510.1: Assign damage from attackers first, then from blockers.
        const sources = [...blockersByAttacker, ...CombatManager.effectiveBlocks].filter(([source]) => {
            // 510.4: Earlier sources assign in the second step only with current double strike.
            const firstStrikeSource = CombatManager.firstStrikeSources.has(source);
            return firstStrike ? firstStrikeSource : !firstStrikeSource || source.hasKeyword(Keyword.DoubleStrike);
        });
        const damage: GameEvent_DealDamage[] = [];
        let index = 0;
        const addDamage = (source: Permanent, recipient: Permanent | Player, amount: number) => {
            if (amount > 0)
                damage.push(new GameEvent_DealDamage(source, recipient, amount));
        };

        const assignNext = () => {
            while (index < sources.length) {
                const [source, opponents] = sources[index++];
                const recipients = [...opponents];
                const total = source.power;
                if (total <= 0)
                    continue;
                if (!recipients.length) {
                    // 509.1h and 510.1b–c: Only unblocked attackers deal damage to the defender.
                    const defender = CombatManager.attackingCreatures.get(source);
                    if (defender && CombatManager.isUnblocked(source))
                        addDamage(source, defender, total);
                    continue;
                }
                if (recipients.length === 1) {
                    addDamage(source, recipients[0], total);
                    continue;
                }

                const chooser = new GameEvent_CheckCombatDamageChooser(source, recipients);
                gameEventManager.checkEvent(chooser);
                game.requestCombatDamageChoice({ player: chooser.player, source, recipients, total }, amounts => {
                    recipients.forEach((recipient, i) => addDamage(source, recipient, amounts[i]));
                    assignNext();
                });
                return;
            }

            // 510.2: Deal all assigned damage before the next state-based action check.
            if (damage.length)
                gameEventManager.performSimultaneous(damage);
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
