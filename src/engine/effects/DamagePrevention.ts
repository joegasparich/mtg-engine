import type { CheckSource } from "@engine/effects/EffectSystem";
import type { DamageRecipient,GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import type { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";

export enum DamagePreventionKind {
    Points,
    NextHit,
    EveryHit,
}

export enum DamageRedirectionKind {
    Points = "RedirectPoints",
}

export type DamageRedirection = {
    kind: DamageRedirectionKind.Points;
    recipient: DamageRecipient;
    destination: DamageRecipient;
    amount: number;
};

export enum DamageAllocationAction {
    Prevent = "prevent",
    Redirect = "redirect",
}

type DamagePreventionMatch = (hit: Pick<GameEvent_DealDamage, "source" | "recipient">) => boolean;

export type DamagePrevention =
    | { kind: DamagePreventionKind.Points; recipient: DamageRecipient; amount: number }
    | {
        kind: DamagePreventionKind.NextHit;
        recipient: DamageRecipient;
        source: CardObject;
        matches?: DamagePreventionMatch;
        // Share a key only when the matching conditions are identical for the same ability definition.
        equivalenceKey?: PropertyKey;
    }
    | { kind: DamagePreventionKind.EveryHit; matches: DamagePreventionMatch };

export type DamageEffect = DamagePrevention | DamageRedirection;

export type DamagePreventionChoices = {
    turnOrder(): readonly Player[];
    chooseEffect(player: Player, options: readonly string[], resume: (index: number) => void): void;
    allocate(player: Player, hits: readonly GameEvent_DealDamage[], total: number, action: DamageAllocationAction,
        resume: (amounts: readonly number[]) => void): void;
};

type Registration = { effect: DamageEffect; by: CheckSource; remaining: number };
type Hit = { event: GameEvent_DealDamage; originalIndex: number; amount: number; appliedRedirections: Set<Registration> };
type Application = { rule: Registration; hits: Hit[]; capacity: number };

function isPoints(effect: DamageEffect) {
    return effect.kind === DamagePreventionKind.Points || effect.kind === DamageRedirectionKind.Points;
}

export class DamagePreventionSystem {
    private readonly rules = new Set<Registration>();

    constructor(private readonly canModify: (hit: GameEvent_DealDamage, source: CheckSource) => boolean) {}

    register(effect: DamageEffect, by: CheckSource): () => void {
        const remaining = isPoints(effect) ? effect.amount : 1;
        const rule = { effect, by, remaining };
        if (remaining > 0)
            this.rules.add(rule);
        return () => { this.rules.delete(rule); };
    }

    getSourceReferences(): CardObject[] {
        return [...this.rules].flatMap(({ effect }) => effect.kind === DamagePreventionKind.NextHit
            ? [effect.source, ...(effect.source.resolvedDamageSource ? [effect.source.resolvedDamageSource] : [])]
            : []);
    }

    preview(hit: GameEvent_DealDamage): boolean {
        const destinationPlayers = [...this.rules].flatMap(({ effect }) => effect.kind === DamageRedirectionKind.Points
            ? [hit.getAffectedPlayer(effect.destination)] : []);
        const players = [...new Set([hit.affectedPlayer, ...destinationPlayers])];
        let willDealDamage = false;
        this.resolve([hit], {
            turnOrder: () => players,
            chooseEffect: (_player, _options, resume) => resume(0),
            allocate: (_player, _hits, total, _action, resume) => resume([total]),
        }, ([resolved]) => { willDealDamage = resolved.length > 0; }, false);
        return willDealDamage;
    }

    resolve(events: readonly GameEvent_DealDamage[], choices: DamagePreventionChoices,
        commit: (resolved: readonly GameEvent_DealDamage[][]) => void, consume = true) {
        const hits: Hit[] = events.map((event, originalIndex) => ({
            event, originalIndex, amount: event.canDealDamage() ? event.amount : 0,
            appliedRedirections: new Set<Registration>(),
        }));
        const remaining = new Map([...this.rules].map(rule => [rule, rule.remaining]));
        const players = choices.turnOrder();

        const applicationsFor = (player: Player): Application[] => {
            const applications: Application[] = [];
            for (const [rule, capacity] of remaining) {
                if (capacity <= 0)
                    continue;
                const applicable = hits.filter(hit => hit.amount > 0 && hit.event.affectedPlayer === player
                    && !hit.appliedRedirections.has(rule) && this.matches(rule, hit.event));
                if (!applicable.length)
                    continue;

                if (isPoints(rule.effect))
                    applications.push({ rule, hits: applicable, capacity });
                else
                    applications.push(...applicable.map(hit => ({ rule, hits: [hit], capacity })));
            }
            return applications;
        };

        const apply = (application: Application, player: Player, resume: () => void): boolean => {
            const { rule, hits: eligible, capacity } = application;
            const { effect } = rule;
            if (!isPoints(effect)) {
                eligible[0].amount = 0;
                if (effect.kind === DamagePreventionKind.NextHit)
                    remaining.set(rule, 0);
                return true;
            }

            const spend = (hit: Hit, amount: number) => {
                hit.amount -= amount;
                if (amount > 0 && effect.kind === DamageRedirectionKind.Points) {
                    // 614.5: All portions of the original hit share the redirection history.
                    hit.appliedRedirections.add(rule);
                    // 614.9: The redirected portion has the original source and a new recipient.
                    const redirected = hits.find(other => other.originalIndex === hit.originalIndex
                        && other.event.recipient === effect.destination);
                    if (redirected)
                        redirected.amount += amount;
                    else
                        hits.push({ ...hit, event: hit.event.withRecipient(effect.destination, amount), amount });
                }
            };

            // 615.7 and 616.1: The affected player allocates a limited effect among simultaneous sources.
            const totalDamage = eligible.reduce((total, hit) => total + hit.amount, 0);
            const total = Math.min(capacity, totalDamage);
            if (total < totalDamage && new Set(eligible.map(hit => hit.event.source)).size > 1) {
                const action = effect.kind === DamageRedirectionKind.Points ? DamageAllocationAction.Redirect : DamageAllocationAction.Prevent;
                choices.allocate(player, eligible.map(hit => hit.event.withAmount(hit.amount)), total, action, amounts => {
                    eligible.forEach((hit, index) => spend(hit, amounts[index]));
                    remaining.set(rule, capacity - total);
                    resume();
                });
                return false;
            }

            let unspent = total;
            for (const hit of eligible) {
                const amount = Math.min(hit.amount, unspent);
                spend(hit, amount);
                unspent -= amount;
            }
            remaining.set(rule, capacity - total);
            return true;
        };

        const advance = () => {
            // 101.4 and 616.1: Resolve choices in turn order and recheck after damage changes recipients.
            for (;;) {
                let player: Player;
                let applications: Application[] = [];
                for (player of players) {
                    applications = applicationsFor(player);
                    if (applications.length)
                        break;
                }
                if (!applications.length)
                    break;
                const options = applications.filter((entry, index) => !applications.slice(0, index)
                    .some(previous => this.equivalent(previous, entry)));
                const independent = options.find(entry => options.every(other => entry === other
                    || this.independent(entry, other)));
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

            if (consume) {
                for (const [rule, capacity] of remaining) {
                    rule.remaining = capacity;
                    if (!capacity)
                        this.rules.delete(rule);
                }
            }

            const resolved = events.map<GameEvent_DealDamage[]>(() => []);
            for (const { event, originalIndex, amount } of hits) {
                if (amount > 0)
                    resolved[originalIndex].push(event.withAmount(amount));
            }
            // Each original hit's completion callback runs once, after all of its remaining damage.
            for (const portions of resolved) {
                for (const event of portions.slice(0, -1))
                    event.callback = undefined;
            }
            commit(resolved);
        };
        advance();
    }

    private matches({ effect, by }: Registration, hit: GameEvent_DealDamage): boolean {
        if (!this.canModify(hit, by))
            return false;
        if (effect.kind === DamageRedirectionKind.Points)
            return hit.recipient === effect.recipient && effect.destination !== effect.recipient
                && hit.canDealDamage(effect.destination);
        if (effect.kind === DamagePreventionKind.Points)
            return hit.recipient === effect.recipient;

        // 609.7a: A next-hit shield can follow a spell into the permanent it becomes.
        if (effect.kind === DamagePreventionKind.NextHit
            && (hit.recipient !== effect.recipient
                || (hit.source !== effect.source && hit.source !== effect.source.resolvedDamageSource)))
            return false;

        // 609.7b and 615.9: Recheck the source's required qualities as damage would be dealt.
        return effect.matches?.(hit) ?? true;
    }

    private independent(a: Application, b: Application): boolean {
        const couldRedirectTo = ({ rule, hits }: Application, other: Registration) => {
            const { effect } = rule;
            return effect.kind === DamageRedirectionKind.Points && hits.some(hit =>
                !hit.appliedRedirections.has(other) && this.matches(other, hit.event.withRecipient(effect.destination, hit.amount)));
        };
        return a.rule !== b.rule && !a.hits.some(hit => b.hits.includes(hit))
            && !couldRedirectTo(a, b.rule) && !couldRedirectTo(b, a.rule);
    }

    private equivalent(a: Application, b: Application): boolean {
        const first = a.rule.effect;
        const second = b.rule.effect;
        if (first.kind === DamagePreventionKind.EveryHit && second.kind === DamagePreventionKind.EveryHit)
            return a.hits[0] === b.hits[0];
        if (first.kind !== second.kind || a.rule.by.object !== b.rule.by.object)
            return false;
        if (first.kind === DamagePreventionKind.Points && second.kind === DamagePreventionKind.Points)
            return first.recipient === second.recipient && a.rule.by.ability === b.rule.by.ability
                && a.capacity === b.capacity
                && a.hits.every(hit => b.hits.includes(hit)) && a.hits.length === b.hits.length;
        if (first.kind === DamageRedirectionKind.Points && second.kind === DamageRedirectionKind.Points)
            return first.recipient === second.recipient && first.destination === second.destination
                && a.rule.by.ability?.def === b.rule.by.ability?.def && a.capacity === b.capacity
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

    private describe({ rule, hits, capacity }: Application): string {
        const name = rule.by.object.name;
        const { event, amount } = hits[0];
        if (rule.effect.kind === DamageRedirectionKind.Points)
            return `${name} · redirect ${capacity} damage from ${event.recipientName} to ${event.getRecipientName(rule.effect.destination)}`;
        if (rule.effect.kind === DamagePreventionKind.Points)
            return `${name} · ${capacity}-point shield for ${event.recipientName}`;
        return `${name} · prevent ${amount} damage from ${event.source.name} to ${event.recipientName}`;
    }
}
