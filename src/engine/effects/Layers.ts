import type { WordReplacement } from "~/rulesWords";
import type { Ability } from "@engine/abilities/Ability";
import type { CardObject } from "@engine/GameObject";
import type { ManaCost } from "@engine/mana";
import type Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import type { CardColour,CardDef,CardType } from "~/defs";

// CR 613.1–4. Numeric order is the order of application.
export enum Layer {
    Copy, FaceDown, Control, Text, Type, Colour, Ability, DefinePT, SetPT, ModifyPT, SwitchPT,
}

export interface Characteristics {
    wordReplacements: readonly WordReplacement[];
    definition: Readonly<CardDef>;
    name: string;
    rulesText: string;
    cost?: ManaCost;
    types: readonly CardType[];
    subtypes: readonly string[];
    colours: ReadonlySet<CardColour>;
    abilities: readonly Ability[];
    prohibitedAbilities?: readonly ((ability: Ability) => boolean)[];
    controller?: Player;
    basePower: number;
    baseToughness: number;
    power: number;
    toughness: number;
}

interface Instruction {
    operands: readonly unknown[];
    operation(state: Characteristics, ...operands: readonly unknown[]): void;
}

export interface LayerChange {
    layer: Layer;
    prepare(object: CardObject): Instruction | undefined;
    canStartOn?(object: CardObject): boolean;
}

// CR 613.8a: Reuse the operation across preparations and capture all variable inputs as operands.
// A fixed +1/+1 modifier still gives the same instruction after the starting power changes.
export function change<T extends readonly unknown[]>(layer: Layer, operands: (object: CardObject) => T,
    operation: (state: Characteristics, ...values: T) => void): LayerChange {
    return { layer, prepare: object => ({ operation, operands: operands(object) }) };
}

export interface LayerEffect {
    select(): readonly CardObject[];
    changes: readonly LayerChange[];
    characteristicDefining?: boolean;
    // Parts of one static ability operating on the same slate selection share recipients (613.6).
    selectionKey?: string;
}

export interface TimedEffect extends LayerEffect {
    timestamp(): number;
}
type States = Map<CardObject, Characteristics>;
type Plan = Map<CardObject, Instruction[]>;

function sameOperand(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((item, index) => sameOperand(item, b[index]));
    if (a instanceof Set && b instanceof Set)
        return a.size === b.size && [...a].every(item => b.has(item));
    return false;
}

function samePlan(first: Plan | undefined, second: Plan | undefined) {
    if (!first || !second || first.size !== second.size)
        return first === second;
    for (const [object, instructions] of first) {
        const other = second.get(object);
        if (!other || instructions.length !== other.length || instructions.some((instruction, i) =>
            instruction.operation !== other[i].operation || !sameOperand(instruction.operands, other[i].operands)))
            return false;
    }
    return true;
}

// Ignore only edges inside dependency loops, preserving dependencies into and out of them (613.8b).
function reaches(from: TimedEffect, to: TimedEffect, edges: Map<TimedEffect, TimedEffect[]>, seen = new Set<TimedEffect>()): boolean {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return edges.get(from)?.some(next => reaches(next, to, edges, seen));
}

export class LayerSystem {
    private clock = 0;
    private readonly objects = new Set<CardObject>();
    private readonly registered = new Set<TimedEffect>();
    private context?: States;
    private simultaneous?: States;
    private readonly resolvingSpells = new WeakMap<CardObject, CardObject>();
    private reconciling = false;
    private dirty = false;

    constructor(private readonly afterBatch: (callback: () => void) => void) {}

    nextTimestamp() { return ++this.clock; }

    track(object: CardObject) { this.objects.add(object); this.changed(); }
    forget(object: CardObject) { this.objects.delete(object); this.changed(); }
    reset() { this.objects.clear(); this.registered.clear(); }

    // 611.2c: Capture the resolving effect's objects, including their zone identity.
    registerResolved(effect: LayerEffect, timestamp = this.nextTimestamp()) {
        const objects = new Set(effect.select());
        const origin = (object: CardObject) => objects.has(object) ? object : this.resolvingSpells.get(object);
        const changes = effect.changes.map(part => {
            if (!part.canStartOn) return part;
            // 113.11: A resolved grant that cannot start on this recipient stays inapplicable.
            const eligible = new Set([...objects].filter(object => part.canStartOn(object)));
            return { ...part, prepare: (object: CardObject) => eligible.has(origin(object)) ? part.prepare(object) : undefined };
        });
        return this.register({
            ...effect,
            changes,
            select: () => [...this.context.keys()].filter(object => objects.has(origin(object))),
        }, timestamp);
    }

    continuesFromSpell(entering: CardObject, spell: CardObject) {
        this.resolvingSpells.set(entering, spell);
    }

    get duringSimultaneousChanges() { return !!this.simultaneous; }

    // 608.2f: Each operation in a simultaneous event sees the characteristics that
    // existed before any member changed the battlefield.
    beginSimultaneousChanges() { this.simultaneous = this.evaluate(); }
    endSimultaneousChanges() { this.simultaneous = undefined; }

    register(effect: LayerEffect, timestamp = this.nextTimestamp()) {
        const timed = { ...effect, timestamp: () => timestamp };
        this.registered.add(timed);
        this.changed();
        return () => { if (this.registered.delete(timed)) this.changed(); };
    }

    changed() {
        this.dirty = true;
        this.afterBatch(this.reconcile);
    }

    // Reads, including speculative dependency checks, never set up listeners or move objects.
    read(object: CardObject): Characteristics {
        if (this.context) return this.state(object);
        return this.simultaneous?.get(object) ?? this.evaluate(object).get(object);
    }

    // 613.2c: Copy effects read only through the end of layer 1.
    copiable(object: CardObject) { return this.evaluate(object, Layer.FaceDown).get(object); }

    private state(object: CardObject) {
        if (!this.context.has(object))
            this.context.set(object, object.startingCharacteristics());
        return this.context.get(object);
    }

    private readonly reconcile = () => {
        if (this.reconciling) return;
        this.reconciling = true;
        const notifications = new Set<() => void>();
        try {
            while (this.dirty) {
                this.dirty = false;
                const states = this.evaluate();
                for (const [object, state] of states) {
                    if (!this.objects.has(object)) continue;
                    const notify = object.reconcileCharacteristics(state, states);
                    if (notify) notifications.add(notify);
                }
            }
        } finally { this.reconciling = false; }
        for (const notify of notifications) notify();
    };

    private evaluate(extra?: CardObject, through = Layer.SwitchPT) {
        const previous = this.context;
        const states: States = new Map();
        this.context = states;
        try {
            for (const object of this.objects) this.state(object);
            if (extra) this.state(extra);
            const started = new Map<TimedEffect, readonly CardObject[]>();
            let effects = this.effects(started);
            for (let layer = Layer.Copy; layer <= through; layer++) {
                effects = this.applyLayer(layer, effects, started);
                if (layer === Layer.SetPT) {
                    for (const state of states.values()) {
                        state.basePower = state.power;
                        state.baseToughness = state.toughness;
                    }
                }
                if (layer === Layer.FaceDown && through > layer) {
                    // 305.6, 613.2c: Derive intrinsic abilities from the copiable type line.
                    // Keep them distinct from the rules text captured by a copy.
                    for (const [object, state] of states)
                        state.abilities = object.withLandAbilities(state);
                }
            }
            return states;
        } finally { this.context = previous; }
    }

    private effects(started: Map<TimedEffect, readonly CardObject[]>) {
        const effects = new Set([...this.registered, ...started.keys()]);
        for (const [object, state] of this.context) {
            for (const effect of object.objectEffects) effects.add(effect);
            for (const ability of state.abilities) {
                for (const effect of ability.layerEffects) {
                    if (object.zone instanceof Battlefield || effect.characteristicDefining)
                        effects.add(effect);
                }
            }
        }
        return effects;
    }

    private plan(effect: TimedEffect, layer: Layer, started: Map<TimedEffect, readonly CardObject[]>) {
        const result: Plan = new Map();
        const changes = effect.changes.filter(change => change.layer === layer);
        for (const object of started.get(effect) ?? effect.select())
            result.set(object, changes.map(change => change.prepare(object)).filter(instruction => instruction !== undefined));
        return result;
    }

    private apply(plan: Plan, layer: Layer) {
        let abilitiesChanged = false;
        for (const [object, instructions] of plan) {
            const before = this.state(object);
            const state = { ...before };
            for (const instruction of instructions) {
                instruction.operation(state, ...instruction.operands);
                if (state.prohibitedAbilities?.length)
                    state.abilities = state.abilities.filter(ability => !state.prohibitedAbilities.some(matches => matches(ability)));
            }
            if (layer === Layer.Type || (layer === Layer.Text && state.subtypes !== before.subtypes))
                state.abilities = object.withLandAbilities(state);
            this.context.set(object, state);
            abilitiesChanged ||= state.abilities !== before.abilities;
        }
        return abilitiesChanged;
    }

    private applyLayer(layer: Layer, effects: Set<TimedEffect>, started: Map<TimedEffect, readonly CardObject[]>) {
        const done = new Set<TimedEffect>();
        for (;;) {
            const candidates = [...effects].filter(effect => !done.has(effect) && effect.changes.some(part => part.layer === layer));
            if (!candidates.length) return effects;
            // 613.3: In layers 2–6, finish characteristic-defining abilities first.
            const defining = layer >= Layer.Control && layer <= Layer.Ability
                ? candidates.filter(effect => effect.characteristicDefining) : [];
            const group = (defining.length ? defining : candidates).sort((a, b) => a.timestamp() - b.timestamp());
            const plans = new Map(group.map(effect => [effect, this.plan(effect, layer, started)]));
            const next = group.length === 1 ? group[0] : this.independent(group, plans, layer, started);
            const plan = plans.get(next);
            const abilitiesChanged = this.apply(plan, layer);
            // An effect with later components continues even if its generating ability disappears.
            if (!started.has(next) && next.changes.some(change => change.layer > layer))
                started.set(next, [...plan.keys()]);
            if (abilitiesChanged) effects = this.effects(started);
            done.add(next);
        }
    }

    private independent(group: TimedEffect[], plans: Map<TimedEffect, Plan>, layer: Layer,
        started: Map<TimedEffect, readonly CardObject[]>) {
        const before = this.context;
        const edges = new Map(group.map(effect => [effect, [] as TimedEffect[]]));
        try {
            for (const candidate of group) {
                this.context = new Map(before);
                const available = this.apply(plans.get(candidate), layer) ? this.effects(started) : undefined;
                for (const effect of group) {
                    if (effect === candidate || !!effect.characteristicDefining !== !!candidate.characteristicDefining) continue;
                    const after = (!available || available.has(effect)) ? this.plan(effect, layer, started) : undefined;
                    if (!samePlan(plans.get(effect), after)) edges.get(effect).push(candidate);
                }
            }
        } finally { this.context = before; }
        return group.find(effect => edges.get(effect).every(prerequisite => reaches(prerequisite, effect, edges)));
    }
}
