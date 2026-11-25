import type { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import type { CheckSource } from "@engine/effects/EffectSystem";
import type { CardObject,Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";

export enum DamagePreventionKind {
    Points,
    NextHit,
    EveryHit,
}

type DamagePreventionMatch = (hit: Pick<GameEvent_DealDamage, "source" | "recipient">) => boolean;

export type DamagePrevention =
    | { kind: DamagePreventionKind.Points; recipient: Permanent | Player; amount: number }
    | {
        kind: DamagePreventionKind.NextHit;
        recipient: Permanent | Player;
        source: CardObject;
        matches?: DamagePreventionMatch;
        // Share a key only when the matching conditions are identical for the same ability definition.
        equivalenceKey?: PropertyKey;
    }
    | { kind: DamagePreventionKind.EveryHit; matches: DamagePreventionMatch };

export type DamagePreventionChoices = {
    turnOrder(): readonly Player[];
    chooseEffect(player: Player, options: readonly string[], resume: (index: number) => void): void;
    allocate(player: Player, hits: readonly GameEvent_DealDamage[], total: number,
        resume: (amounts: readonly number[]) => void): void;
};

type Registration = { prevention: DamagePrevention; by: CheckSource; remaining: number };
type Hit = { event: GameEvent_DealDamage; amount: number };
type Application = { rule: Registration; hits: Hit[] };

export class DamagePreventionSystem {
    private readonly rules = new Set<Registration>();

    constructor(private readonly canPrevent: (hit: GameEvent_DealDamage, source: CheckSource) => boolean) {}

    register(prevention: DamagePrevention, by: CheckSource): () => void {
        const remaining = prevention.kind === DamagePreventionKind.Points ? prevention.amount : 1;
        const rule = { prevention, by, remaining };
        if (remaining > 0)
            this.rules.add(rule);
        return () => { this.rules.delete(rule); };
    }

    getSourceReferences(): CardObject[] {
        return [...this.rules].flatMap(({ prevention }) => prevention.kind === DamagePreventionKind.NextHit
            ? [prevention.source, ...(prevention.source.resolvedDamageSource ? [prevention.source.resolvedDamageSource] : [])]
            : []);
    }

    preview(hit: GameEvent_DealDamage): boolean {
        // For a single hit, any legal order leaves the same amount of damage.
        let amount = hit.amount;
        for (const rule of this.rules) {
            if (!this.matches(rule, hit))
                continue;
            if (rule.prevention.kind !== DamagePreventionKind.Points)
                return false;
            amount -= rule.remaining;
        }
        return amount > 0 && hit.canDealDamage();
    }

    resolve(events: readonly GameEvent_DealDamage[], choices: DamagePreventionChoices,
        commit: (amounts: readonly number[]) => void) {
        const hits: Hit[] = events.map(event => ({ event, amount: event.canDealDamage() ? event.amount : 0 }));
        const remaining = new Map([...this.rules].map(rule => [rule, rule.remaining]));
        const players = choices.turnOrder();
        let playerIndex = 0;

        const applicationsFor = (player: Player): Application[] => {
            const applications: Application[] = [];
            for (const [rule, capacity] of remaining) {
                if (capacity <= 0)
                    continue;
                const applicable = hits.filter(hit => hit.amount > 0 && hit.event.affectedPlayer === player
                    && this.matches(rule, hit.event));
                if (!applicable.length)
                    continue;

                if (rule.prevention.kind === DamagePreventionKind.Points)
                    applications.push({ rule, hits: applicable });
                else
                    applications.push(...applicable.map(hit => ({ rule, hits: [hit] })));
            }
            return applications;
        };

        const apply = (application: Application, player: Player, resume: () => void): boolean => {
            const { rule, hits: eligible } = application;
            const capacity = remaining.get(rule);
            if (rule.prevention.kind !== DamagePreventionKind.Points) {
                eligible[0].amount = 0;
                if (rule.prevention.kind === DamagePreventionKind.NextHit)
                    remaining.set(rule, 0);
                return true;
            }

            // 615.7: Spend only what the shield can prevent. The affected player divides it among sources.
            const totalDamage = eligible.reduce((total, hit) => total + hit.amount, 0);
            const total = Math.min(capacity, totalDamage);
            if (total < totalDamage && new Set(eligible.map(hit => hit.event.source)).size > 1) {
                choices.allocate(player, eligible.map(hit => hit.event.withAmount(hit.amount)), total, amounts => {
                    eligible.forEach((hit, index) => { hit.amount -= amounts[index]; });
                    remaining.set(rule, capacity - total);
                    resume();
                });
                return false;
            }

            let unspent = total;
            for (const hit of eligible) {
                const prevented = Math.min(hit.amount, unspent);
                hit.amount -= prevented;
                unspent -= prevented;
            }
            remaining.set(rule, capacity - total);
            return true;
        };

        const advance = () => {
            // 101.4 and 616.1: Resolve each affected player's choices in turn order.
            while (playerIndex < players.length) {
                const player = players[playerIndex];
                const applications = applicationsFor(player);
                if (!applications.length) {
                    playerIndex++;
                    continue;
                }

                const options = applications.filter((entry, index) => !applications.slice(0, index)
                    .some(previous => this.equivalent(previous, entry)));
                const independent = options.find(entry => options.every(other => entry === other
                    || (entry.rule !== other.rule && !entry.hits.some(hit => other.hits.includes(hit)))));
                if (!independent) {
                    choices.chooseEffect(player, options.map(entry => this.describe(entry)), index => {
                        if (apply(options[index], player, advance))
                            advance();
                    });
                    return;
                }

                if (!apply(independent, player, advance))
                    return;
            }

            for (const [rule, capacity] of remaining) {
                rule.remaining = capacity;
                if (!capacity)
                    this.rules.delete(rule);
            }
            commit(hits.map(hit => hit.amount));
        };
        advance();
    }

    private matches({ prevention, by }: Registration, hit: GameEvent_DealDamage): boolean {
        if (!this.canPrevent(hit, by))
            return false;
        if (prevention.kind === DamagePreventionKind.Points)
            return hit.recipient === prevention.recipient;

        // 609.7a: A next-hit shield can follow a spell into the permanent it becomes.
        if (prevention.kind === DamagePreventionKind.NextHit
            && (hit.recipient !== prevention.recipient
                || (hit.source !== prevention.source && hit.source !== prevention.source.resolvedDamageSource)))
            return false;

        // 609.7b and 615.9: Recheck the source's required qualities as damage would be dealt.
        return prevention.matches?.(hit) ?? true;
    }

    private equivalent(a: Application, b: Application): boolean {
        const first = a.rule.prevention;
        const second = b.rule.prevention;
        if (first.kind === DamagePreventionKind.EveryHit && second.kind === DamagePreventionKind.EveryHit)
            return a.hits[0] === b.hits[0];
        if (first.kind !== second.kind || a.rule.by.object !== b.rule.by.object)
            return false;
        if (first.kind === DamagePreventionKind.Points && second.kind === DamagePreventionKind.Points)
            return first.recipient === second.recipient && a.rule.by.ability === b.rule.by.ability
                && a.rule.remaining === b.rule.remaining
                && a.hits.every(hit => b.hits.includes(hit)) && a.hits.length === b.hits.length;
        if (first.kind === DamagePreventionKind.NextHit && second.kind === DamagePreventionKind.NextHit) {
            const sameKey = first.equivalenceKey !== undefined
                && first.equivalenceKey === second.equivalenceKey
                && a.rule.by.ability?.def === b.rule.by.ability?.def;
            return (a.rule === b.rule || sameKey)
                && first.recipient === second.recipient && first.source === second.source
                && a.hits[0].event.source === b.hits[0].event.source && a.hits[0].amount === b.hits[0].amount;
        }
        return false;
    }

    private describe({ rule, hits }: Application): string {
        const name = rule.by.object.name;
        const { event, amount } = hits[0];
        if (rule.prevention.kind === DamagePreventionKind.Points)
            return `${name} · ${rule.remaining}-point shield for ${event.recipientName}`;
        return `${name} · prevent ${amount} damage from ${event.source.name} to ${event.recipientName}`;
    }
}
