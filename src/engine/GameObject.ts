import type { ActionTarget } from "@engine/actions";
import type Card from "@engine/Card";
import { Ability,makeAbility } from "@engine/abilities";
import { getBasicLandMana } from "@engine/abilities/BasicLandMana";
import type { AbilityPart_Target } from "@engine/abilities/parts/AbilityPart_Target";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import { abilityGrant } from "@engine/effects/AbilityGrant";
import { change,Layer,type Characteristics,type LayerChange,type TimedEffect } from "@engine/effects/Layers";
import { GameEvent_CheckAttachment } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager,{ type GameEvent } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaColour,ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { Battlefield,Zone } from "@engine/Zone";
import { removeItem } from "@utility/arrayUtility";
import { type AbilityDef,type CardColour,type CardDef,cardColours,CardType,Keyword } from "~/defs";

let idCounter = 0;

export abstract class GameObject {
    readonly id = idCounter++;
    protected currentZone?: Zone;
    private hasRetired = false;

    get zone() { return this.currentZone; }
    get retired() { return this.hasRetired; }

    enterZone(zone: Zone) {
        this.currentZone = zone;
    }

    captureBeforeLeaving?(): void;

    retire() {
        this.currentZone = undefined;
        this.hasRetired = true;
    }
}

export class CardObject extends GameObject {
    get controller(): Player | undefined { return this.characteristics.controller; }
    protected get initialController(): Player | undefined { return undefined; }
    get owner() { return this.card.owner; }
    get def() { return this.characteristics.definition; }
    get logName() { return `${this.name} (${this.id})`; }
    get resolvedDamageSource(): Permanent | undefined { return undefined; }

    timestamp = 0;
    private readonly localEffects = new Set<TimedEffect & { followsResolution?: boolean }>();
    get objectEffects(): Iterable<TimedEffect> { return this.localEffects; }
    private readonly printed: Characteristics;
    protected copiedValues?: Characteristics;
    private get baseValues() { return this.copiedValues ?? this.printed; }
    private lastKnown?: Readonly<Characteristics>;
    private spellModeAbilities?: Map<number, readonly Ability[]>;
    private readonly activeAbilities = new Set<Ability>();
    private readonly basicLandAbilities = new Map<AbilityDef, Ability>();

    constructor(readonly card: Card, chosenMode?: number) {
        super();
        this.printed = this.bindDefinition(card.def);
        if (chosenMode !== undefined)
            this.printed.abilities = [...this.printed.abilities, ...this.getSpellModeAbilities(chosenMode)];
    }

    createAbility(def: AbilityDef, grantedBy?: CardObject) { return makeAbility(def, this, grantedBy); }

    protected bindDefinition(def: Readonly<CardDef>): Characteristics {
        const cost = def.cost ? [...ManaUtility.parseManaString<ManaCost>(def.cost)] as ManaCost : undefined;
        return { definition: def, name: def.name, rulesText: def.oracle_text, types: def.types, subtypes: def.subtypes ?? [], cost,
            colours: new Set(cardColours.filter(colour => cost?.[ManaColour[colour]] > 0)),
            power: def.power, toughness: def.toughness, basePower: def.power, baseToughness: def.toughness,
            abilities: (def.abilities ?? []).map(ability => this.createAbility(ability)) };
    }

    startingCharacteristics(): Characteristics { return { ...this.printed, controller: this.initialController }; }
    get characteristics(): Readonly<Characteristics> {
        return this.retired && this.lastKnown ? this.lastKnown : gameEventManager.effects.layers.read(this);
    }

    captureBeforeLeaving() { this.lastKnown = this.characteristics; }
    get name() { return this.characteristics.name; }
    get cost() { return this.characteristics.cost; }
    set cost(cost: ManaCost) { this.baseValues.cost = cost; this.changed(); }
    get variableManaSymbols() { return ManaUtility.countVariableSymbols(this.def.cost); }
    get colours() { return this.characteristics.colours; }
    set colours(value: ReadonlySet<CardColour>) {
        const colours = new Set(value);
        this.addObjectEffect([change(Layer.Colour, () => [colours] as const,
            (state, replacement) => { state.colours = replacement; })], true);
    }

    // 400.7a: A characteristic-changing resolution follows a permanent spell into play,
    // retaining its original timestamp. Other zone changes create a fresh rules object.
    carryResolutionEffectsTo(entering: Permanent) {
        gameEventManager.effects.layers.continuesFromSpell(entering, this);
        for (const effect of this.localEffects)
            if (effect.followsResolution) entering.addObjectEffect(effect.changes, false, effect.timestamp());
    }

    protected addObjectEffect(changes: readonly LayerChange[], followsResolution = false,
        timestamp = gameEventManager.effects.layers.nextTimestamp()) {
        const effect = { changes, select: () => [this], timestamp: () => timestamp, followsResolution };
        this.localEffects.add(effect);
        this.changed();
        return () => { if (this.localEffects.delete(effect)) this.changed(); };
    }

    protected changed() { if (this.zone) gameEventManager.effects.layers.changed(); }
    get types() { return this.characteristics.types; }
    set types(types: readonly CardType[]) { this.baseValues.types = [...types]; this.changed(); }
    hasType(type: CardType) { return this.types.includes(type); }
    get subtypes() { return this.characteristics.subtypes; }
    set subtypes(subtypes: readonly string[]) { this.baseValues.subtypes = [...subtypes]; this.changed(); }
    hasBaseSubtype(subtype: string) { return this.baseValues.subtypes.includes(subtype); }

    getPowerToughness({ power, toughness } = this.characteristics) { return { power, toughness }; }
    get power() { return this.characteristics.power; }
    set power(power: number) { this.baseValues.basePower = this.baseValues.power = power; this.changed(); }
    get toughness() { return this.characteristics.toughness; }
    set toughness(toughness: number) { this.baseValues.baseToughness = this.baseValues.toughness = toughness; this.changed(); }
    get abilities() { return this.characteristics.abilities; }
    set abilities(abilities: readonly Ability[]) {
        this.baseValues.abilities = abilities.filter(ability => !ability.grantedBy && this.basicLandAbilities.get(ability.def) !== ability);
        this.changed();
    }

    withLandAbilities(state: Characteristics) {
        const abilities = this.basicLandAbilities.size
            ? state.abilities.filter(ability => this.basicLandAbilities.get(ability.def) !== ability)
            : [...state.abilities];
        if (!state.types.includes(CardType.Land))
            return abilities.length === state.abilities.length ? state.abilities : abilities;
        for (const subtype of new Set(state.subtypes)) {
            const def = getBasicLandMana(subtype);
            if (!def) continue;
            if (!this.basicLandAbilities.has(def)) this.basicLandAbilities.set(def, this.createAbility(def));
            abilities.push(this.basicLandAbilities.get(def));
        }
        return abilities.length === state.abilities.length && abilities.every((ability, i) => ability === state.abilities[i])
            ? state.abilities : abilities;
    }

    reconcileCharacteristics(state: Characteristics, states: ReadonlyMap<CardObject, Characteristics>): (() => void) | void {
        for (const ability of this.activeAbilities) {
            if (!state.abilities.includes(ability)) {
                this.activeAbilities.delete(ability);
                ability.cleanup();
                // The source can lose this ability in layer 6 after its effect has already
                // begun. Reconcile any continuing grants against the same final snapshot.
                for (const part of ability.parts) part.reconcileLayers?.(states);
            }
        }
        for (const ability of state.abilities) {
            if (!this.activeAbilities.has(ability)) {
                this.activeAbilities.add(ability);
                ability.setup();
            }
            for (const part of ability.parts) part.reconcileLayers?.(states);
        }
    }

    grantAbility(def: AbilityDef, source: CardObject) {
        const timestamp = gameEventManager.effects.layers.nextTimestamp();
        const grant = abilityGrant(def, source, () => timestamp);
        const ability = grant.forObject(this);
        const revoke = grant.change.canStartOn(this) ? this.addObjectEffect([grant.change], false, timestamp) : () => {};
        return { ability, revoke };
    }

    enterZone(zone: Zone) {
        super.enterZone(zone);
        this.timestamp ||= gameEventManager.effects.layers.nextTimestamp();
        gameEventManager.effects.layers.track(this);
    }

    retire() {
        super.retire();
        for (const ability of this.activeAbilities) ability.cleanup();
        this.activeAbilities.clear();
        gameEventManager.effects.layers.forget(this);
    }

    canPlay() {
        if (this.zone !== this.owner.hand || game.priorityPlayer !== this.owner)
            return false;

        // 117.1a and 116.2a: Other spells and land plays use main-phase timing.
        if (!this.hasType(CardType.Instant) && (this.owner !== game.currentTurnPlayer() || game.stack.objects.length
            || (game.currentStepIndex !== StepIndex.Main && game.currentStepIndex !== StepIndex.SecondMain)))
            return false;

        if (this.hasType(CardType.Land))
            return !game.landPlayedThisTurn;

        return this.abilities.every(ability => ability.parts.every(part => part.canCast?.() ?? true))
            && (this.def.spellModes
                ? this.def.spellModes.some((_, mode) => this.canChooseSpellMode(mode))
                : (this.spellTargeter?.hasLegalTargets() ?? true));
    }

    canChooseSpellMode(mode: number): boolean {
        // 700.2a: A mode may be chosen only if its casting requirements can be met.
        return Number.isInteger(mode) && !!this.def.spellModes?.[mode]
            && this.getSpellModeAbilities(mode).every(ability => ability.parts.every(part => part.canCast?.() ?? true))
            && (this.getSpellTargeter(mode)?.hasLegalTargets() ?? true);
    }

    get spellTargeter(): AbilityPart_Target | undefined {
        return this.getSpellTargeter();
    }

    getSpellTargeter(mode?: number): AbilityPart_Target | undefined {
        // 700.2c: Only the chosen mode contributes its targets.
        const abilities = mode === undefined ? this.abilities : [...this.abilities, ...this.getSpellModeAbilities(mode)];
        for (const ability of abilities) {
            // 115.1c: Choose an activated ability's targets only when activating it.
            if (ability.activatable)
                continue;

            const targeter = ability.targeter;
            if (targeter)
                return targeter;
        }
    }

    private getSpellModeAbilities(mode: number): readonly Ability[] {
        const modeDef = this.def.spellModes?.[mode];
        if (!modeDef)
            return [];

        const modes = this.spellModeAbilities ??= new Map();
        if (!modes.has(mode))
            modes.set(mode, modeDef.abilities.map(ability => makeAbility(ability, this)));
        return modes.get(mode);
    }

    canAttachTo(target: Permanent): boolean {
        // 701.3a: Check the attachment's own restrictions and effects on the intended recipient.
        return target.id !== this.id && target.zone instanceof Battlefield
            && this.abilities.every(ability => ability.parts.every(part => part.canAttachTo?.(target) ?? true))
            && gameEventManager.checkEvent(new GameEvent_CheckAttachment(this, target));
    }

    checkState(actions: GameEvent[]) {
        for (const ability of this.abilities) {
            for (const part of ability.parts)
                part.checkState?.(actions);
        }
    }

    // Getters
    hasKeyword(keyword: Keyword) {
        return this.abilities.some(a => a.def.keyword === keyword);
    }
}


export class Permanent extends CardObject {
    private copiedFace?: Readonly<CardDef>;
    get printedFace() { return this.copiedFace ?? this.card.def; }
    get isCopy() { return this.copiedFace !== undefined; }

    get copiableDefinition(): Readonly<CardDef> {
        const { definition, name, rulesText, types, subtypes, power, toughness, abilities } = gameEventManager.effects.layers.copiable(this);
        const definitions = abilities.map(ability => ability.originalDefinition);
        const same = <T>(a: readonly T[], b: readonly T[] = []) => a.length === b.length && a.every((value, i) => value === b[i]);
        if (name === definition.name && rulesText === definition.oracle_text && power === definition.power && toughness === definition.toughness
            && same(types, definition.types) && same(subtypes, definition.subtypes) && same(definitions, definition.abilities))
            return definition;
        return { ...definition, name, oracle_text: rulesText, types, subtypes: [...subtypes], power, toughness, abilities: definitions };
    }

    enterAsCopyOf(original: Permanent, definition: Readonly<CardDef>) {
        if (this.zone || this.retired)
            throw new Error("Only a permanent preparing to enter can enter as a copy");
        // 613.2a, 707.2–3: Capture the layer-one definition, including earlier copies.
        // Fresh ability instances bind their source, slate and listeners to this permanent.
        const values = gameEventManager.effects.layers.copiable(original);
        const copy = this.copiedValues = this.bindDefinition(definition);
        if (definition.cost === values.definition.cost) {
            copy.colours = values.colours;
            copy.cost = values.cost;
        }
        this.copiedFace = original.printedFace;
        this.addObjectEffect([change(Layer.Copy, () => [copy] as const,
            (state, values) => { Object.assign(state, values); })]);
    }

    private attachment?: Permanent;
    private observedAttachment?: Permanent;
    private baseController: Player;
    private currentController: Player;
    private readonly controlOrAttachmentListeners = new Set<() => void>();
    private controlledSinceTurn: number;
    private isTapped = false;
    get tapped() { return this.isTapped; }
    set tapped(value: boolean) { this.isTapped = value; this.changed(); }
    damageTaken = 0;

    constructor(card: Card, controller: Player, attachedTo?: Permanent) {
        super(card);
        this.baseController = this.currentController = controller;
        this.controlledSinceTurn = game?.options ? game.turnNumber : -1;
        this.attachment = attachedTo;
    }

    protected override get initialController() { return this.retired ? this.currentController : this.baseController; }
    override get controller() { return super.controller; }
    override set controller(player: Player) { this.baseController = player; this.changed(); }

    override reconcileCharacteristics(state: Characteristics, states: ReadonlyMap<CardObject, Characteristics>) {
        super.reconcileCharacteristics(state, states);
        if (!state.types.includes(CardType.Creature))
            CombatManager.removeFromCombat(this);
        const controller = state.controller;
        const controlChanged = controller !== this.currentController;
        const attachmentChanged = this.observedAttachment !== this.attachment;
        this.observedAttachment = this.attachment;
        if (controlChanged) {
            this.currentController = controller;
            this.controlledSinceTurn = game?.options ? game.turnNumber : -1;
            CombatManager.removeFromCombat(this);
        }
        const zone = this.zone;
        if (zone instanceof Battlefield && zone !== controller.battlefield) {
            // 400.1: A control change moves the object between partitions of the same battlefield.
            removeItem(zone.objects, this);
            controller.battlefield.objects.push(this);
            this.currentZone = controller.battlefield;
        }
        if (controlChanged || attachmentChanged)
            return this.notifyControlOrAttachmentChanged;
    }

    private readonly notifyControlOrAttachmentChanged = () => {
        for (const update of this.controlOrAttachmentListeners) update();
    };

    onControlOrAttachmentChanged(update: () => void) {
        this.controlOrAttachmentListeners.add(update);
        return () => this.controlOrAttachmentListeners.delete(update);
    }

    get controlledSinceTurnStart() {
        return this.controlledSinceTurn < this.controller.lastTurnStartedAt;
    }

    get canPayTapCost() {
        // 302.6: Creatures must have been controlled since the start of their controller's most recent turn.
        return this.zone instanceof Battlefield && !this.tapped
            && (!this.hasType(CardType.Creature) || this.controlledSinceTurnStart);
    }

    get attachedTo() { return this.attachment; }

    set attachedTo(target: Permanent | undefined) { this.attachTo(target); }

    attachTo(target: Permanent | undefined, timestamp?: number) {
        if (this.attachment === target)
            return;

        this.attachment = target;
        if (this.zone instanceof Battlefield) {
            if (target) this.timestamp = timestamp ?? gameEventManager.effects.layers.nextTimestamp();
            this.changed();
        }
    }

    public getPotentialMana(actor: Player): Readonly<ManaAmount> {
        // TODO: Optimise with a canAddMana flag?
        const potentialMana: ManaAmount = [0, 0, 0, 0, 0, 0];

        if (this.zone === actor.battlefield && this.controller === actor) {
            for (const ability of this.abilities) {
                if (ability.def.isManaAbility && ability.isFreeTap && ability.canActivate())
                    ManaUtility.addMana(potentialMana, ability.getPotentialMana());
            }
        }

        return potentialMana;
    }

    canActivate(ability: Ability, actor: Player, allowManaWithoutPriority = false) {
        return this.zone instanceof Battlefield && this.abilities.includes(ability) && ability.activator === actor
            && (game.priorityPlayer === actor || (allowManaWithoutPriority && ability.def.isManaAbility))
            && ability.canActivate();
    }

    hasLegalAttachment(): boolean {
        return !!this.attachedTo && this.canAttachTo(this.attachedTo);
    }

    checkState(actions: GameEvent[]) {
        super.checkState(actions);
        if (!(this.zone instanceof Battlefield))
            return;
        const base = this.characteristics;
        if (!base.types.includes(CardType.Creature)) {
            // 506.4: Losing an animation effect also removes an attacker or blocker from combat.
            if (CombatManager.attackingCreatures.has(this) || CombatManager.blockingCreatures.has(this) || CombatManager.isBlocking(this))
                CombatManager.removeFromCombat(this);
            return;
        }

        // 704.5f–g: Zero toughness puts a creature into the graveyard. Lethal damage destroys it.
        const { toughness } = this.getPowerToughness(base);
        if (toughness <= 0)
            actions.push(new GameEvent_ChangeCardZone(this, this.owner.graveyard));
        else if (toughness > 0 && this.damageTaken >= toughness)
            actions.push(new GameEvent_DestroyPermanent(this));
    }

    destroy(): boolean {
        if (!(this.zone instanceof Battlefield)) {
            console.error(`${this.logName} was destroyed but was not on battlefield`);
            return false;
        }

        gameEventManager.addEvent(new GameEvent_DestroyPermanent(this));
        return true;
    }

}

export class Spell extends CardObject {
    readonly targets: readonly ActionTarget[];
    resolvedPermanent?: Permanent;
    override get resolvedDamageSource() { return this.resolvedPermanent; }

    constructor(card: Card, readonly caster: Player, targets: readonly ActionTarget[],
        readonly chosenX = 0, readonly chosenMode?: number) {
        super(card, chosenMode);
        this.targets = [...targets];
        // 107.3a: X in the cost of a spell on the stack equals its announced value.
        if (this.variableManaSymbols)
            this.cost = ManaUtility.withX(this.cost, this.variableManaSymbols, chosenX);
    }

    protected override get initialController() { return this.caster; }

    get isPermanent(): boolean {
        // 110.4b: Permanent spells enter the battlefield as part of resolution.
        return this.hasType(CardType.Artifact) || this.hasType(CardType.Creature) || this.hasType(CardType.Enchantment);
    }
}

export class StackAbility extends GameObject {
    readonly ability: Ability;
    readonly targets: readonly ActionTarget[];

    constructor(readonly controller: Player, readonly source: CardObject, ability: Ability,
        private readonly signal: string, inputs: Ability["slate"] = {}, targets: readonly ActionTarget[] = []) {
        super();
        this.targets = [...targets];
        // 113.7a: Each occurrence resolves independently of its source and other occurrences.
        this.ability = makeAbility(ability.def, source, ability.grantedBy);
        for (const [key, value] of Object.entries({ ...ability.slate, ...inputs }))
            this.ability.slate[key] = Array.isArray(value) ? [...value] : value;
        this.ability.slate.CONTROLLER = [controller];
    }

    resolve() {
        if (!this.zone)
            return;

        // 608.2b: Recheck targeting restrictions against the current game state.
        const targeter = this.ability.targeter;
        if (targeter && !targeter.validateTargets(this.targets))
            return;

        targeter?.applyTargets(this.targets);
        this.ability.fireSignal(this.signal);
    }
}
