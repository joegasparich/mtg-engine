import type { ActionTarget } from "@engine/actions";
import type Card from "@engine/Card";
import { Ability,makeAbility } from "@engine/abilities";
import { getBasicLandMana } from "@engine/abilities/BasicLandMana";
import type { AbilityPart_Target } from "@engine/abilities/parts/AbilityPart_Target";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import { type CardCharacteristics,GameEvent_CheckAttachment,GameEvent_CheckCharacteristics,GameEvent_CheckPowerToughness } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager,{ type GameEvent } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaColour,ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { Battlefield,Zone } from "@engine/Zone";
import { type AbilityDef,type CardColour,type CardDef,cardColours,CardType,Keyword } from "~/defs";

let idCounter = 0;

export abstract class GameObject {
    readonly id = idCounter++;
    private currentZone?: Zone;
    private hasRetired = false;

    get zone() { return this.currentZone; }
    get retired() { return this.hasRetired; }

    enterZone(zone: Zone) {
        this.currentZone = zone;
    }

    retire() {
        this.currentZone = undefined;
        this.hasRetired = true;
    }
}

export class CardObject extends GameObject {
    get controller(): Player | undefined { return undefined; }
    get owner() { return this.card.owner; }
    get def(): Readonly<CardDef> { return this.card.def; }
    get logName() { return `${this.name} (${this.id})`; }
    get resolvedDamageSource(): Permanent | undefined { return undefined; }

    name: string;
    private baseTypes: readonly CardType[];
    private baseSubtypes: readonly string[];
    cost?: ManaCost;
    get variableManaSymbols() { return ManaUtility.countVariableSymbols(this.def.cost); }
    private baseColours: ReadonlySet<CardColour>;
    private colourOverride?: ReadonlySet<CardColour>;
    get colours() { return this.colourOverride ?? this.baseColours; }
    set colours(colours: ReadonlySet<CardColour>) { this.colourOverride = colours; }
    get changedColours() { return this.colourOverride; }
    private basePower: number;
    private baseToughness: number;
    private baseAbilities: readonly Ability[];
    private spellModeAbilities?: Map<number, readonly Ability[]>;
    private readonly activeBaseAbilities = new Set<Ability>();
    private basicLandAbilities?: Map<AbilityDef, Ability>;
    private readonly grantedAbilities = new Set<Ability>();

    constructor(readonly card: Card, chosenMode?: number) {
        super();
        this.applyDefinition(card.def);
        if (chosenMode !== undefined)
            this.baseAbilities = [...this.baseAbilities, ...this.getSpellModeAbilities(chosenMode)];
    }

    protected applyDefinition(def: Readonly<CardDef>) {
        this.name = def.name;
        this.baseTypes = [...def.types];
        this.baseSubtypes = [...(def.subtypes ?? [])];
        this.power = def.power;
        this.toughness = def.toughness;
        this.cost = def.cost ? [...ManaUtility.parseManaString<ManaCost>(def.cost)] : undefined;
        // 202.2: The coloured symbols in the mana cost determine the object's starting colours.
        this.baseColours = new Set(cardColours.filter(colour => this.cost?.[ManaColour[colour]] > 0));
        this.baseAbilities = (def.abilities ?? []).map(ability => makeAbility(ability, this));
    }

    get characteristics(): Readonly<CardCharacteristics> {
        const base = {
            types: this.baseTypes,
            subtypes: this.baseSubtypes,
            basePower: this.basePower,
            baseToughness: this.baseToughness,
            nativeAbilities: this.baseAbilities,
        };
        return this.zone instanceof Battlefield ? GameEvent_CheckCharacteristics.evaluate(this, base) : base;
    }

    get types(): readonly CardType[] {
        return this.characteristics.types;
    }

    set types(types: readonly CardType[]) {
        // 506.4: A creature that stops being a creature leaves combat immediately.
        const wasCreature = this.hasType(CardType.Creature);
        this.baseTypes = [...types];
        if (this instanceof Permanent && wasCreature && !this.hasType(CardType.Creature))
            CombatManager.removeFromCombat(this);
        this.refreshBaseAbilities();
        if (this.zone instanceof Battlefield)
            gameEventManager.effects.refreshAbilityGrants();
    }

    hasType(type: CardType): boolean {
        return this.types.includes(type);
    }

    get subtypes(): readonly string[] {
        return this.characteristics.subtypes;
    }

    set subtypes(subtypes: readonly string[]) {
        this.baseSubtypes = subtypes;
        this.refreshBaseAbilities();
        if (this.zone instanceof Battlefield)
            gameEventManager.effects.refreshAbilityGrants();
    }

    hasBaseSubtype(subtype: string): boolean {
        return this.baseSubtypes.includes(subtype);
    }

    getPowerToughness(base = this.characteristics): { power: number; toughness: number } {
        if (!(this instanceof Permanent))
            return { power: base.basePower, toughness: base.baseToughness };

        const check = new GameEvent_CheckPowerToughness(this, base);
        gameEventManager.checkEvent(check);
        return { power: check.power, toughness: check.toughness };
    }

    get power(): number {
        return this.getPowerToughness().power;
    }

    set power(power: number) { this.basePower = power; }

    get toughness(): number {
        return this.getPowerToughness().toughness;
    }

    set toughness(toughness: number) { this.baseToughness = toughness; }

    get abilities(): readonly Ability[] {
        const abilities = this.effectiveBaseAbilities;
        return this.grantedAbilities.size > 0 ? [...abilities, ...this.grantedAbilities] : abilities;
    }

    set abilities(abilities: readonly Ability[]) {
        this.baseAbilities = abilities.filter(ability => !this.grantedAbilities.has(ability)
            && this.basicLandAbilities?.get(ability.def) !== ability);
        this.refreshBaseAbilities();
    }

    private get effectiveBaseAbilities(): readonly Ability[] {
        const base = this.characteristics;
        if (!base.types.includes(CardType.Land))
            return base.nativeAbilities;

        // 305.6–7: Land subtypes give intrinsic mana abilities. Setting a basic land type replaces
        // the old subtypes and rules-text abilities, while externally granted abilities still apply.
        const abilities = [...base.nativeAbilities];
        for (const subtype of new Set(base.subtypes)) {
            const def = getBasicLandMana(subtype);
            if (!def)
                continue;

            const intrinsic = this.basicLandAbilities ??= new Map();
            if (!intrinsic.has(def))
                intrinsic.set(def, makeAbility(def, this));
            abilities.push(intrinsic.get(def));
        }
        return abilities;
    }

    refreshBaseAbilities() {
        if (!this.zone)
            return;

        const abilities = this.effectiveBaseAbilities;
        for (const ability of this.activeBaseAbilities) {
            if (!abilities.includes(ability)) {
                this.activeBaseAbilities.delete(ability);
                ability.cleanup();
            }
        }
        for (const ability of abilities) {
            if (!this.activeBaseAbilities.has(ability)) {
                this.activeBaseAbilities.add(ability);
                ability.setup();
            }
        }
    }

    grantAbility(def: AbilityDef, grantedBy: CardObject): { ability: Ability; revoke: () => void } {
        // 613.1f: Each continuous effect contributes its own ability instance.
        const ability = makeAbility(def, this, grantedBy);
        this.grantedAbilities.add(ability);
        if (this.zone)
            ability.setup();

        return {
            ability,
            revoke: () => {
                if (this.grantedAbilities.delete(ability))
                    ability.cleanup();
            },
        };
    }

    enterZone(zone: Zone) {
        super.enterZone(zone);
        const grants = [...this.grantedAbilities];
        this.refreshBaseAbilities();
        grants.forEach(ability => {
            if (this.grantedAbilities.has(ability))
                ability.setup();
        });
        // 611.3c: Grant abilities before a permanent's entry is observed by triggers.
        if (zone instanceof Battlefield)
            gameEventManager.effects.refreshAbilityGrants();
    }

    retire() {
        const wasOnBattlefield = this.zone instanceof Battlefield;
        this.activeBaseAbilities.forEach(ability => ability.cleanup());
        this.activeBaseAbilities.clear();
        this.grantedAbilities.forEach(ability => ability.cleanup());
        this.grantedAbilities.clear();
        super.retire();
        if (wasOnBattlefield)
            gameEventManager.effects.refreshAbilityGrants();
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
    private copiedDefinition?: Readonly<CardDef>;
    private copiedFace?: Readonly<CardDef>;
    override get def() { return this.copiedDefinition ?? super.def; }
    get printedFace() { return this.copiedFace ?? this.card.def; }
    get isCopy() { return this.copiedFace !== undefined; }

    enterAsCopyOf(original: Permanent, definition: Readonly<CardDef>) {
        if (this.zone || this.retired)
            throw new Error("Only a permanent preparing to enter can enter as a copy");
        // 613.2a, 707.2–3: Capture the layer-one definition, including earlier copies.
        // Fresh ability instances bind their source, slate and listeners to this permanent.
        this.copiedDefinition = definition;
        this.copiedFace = original.printedFace;
        this.applyDefinition(definition);
    }

    private attachment?: Permanent;
    private currentController: Player;
    private controlledSinceTurn: number;
    tapped = false;
    damageTaken = 0;

    constructor(card: Card, controller: Player, attachedTo?: Permanent) {
        super(card);
        this.controller = controller;
        this.attachment = attachedTo;
    }

    override get controller() { return this.currentController; }

    override set controller(player: Player) {
        if (this.currentController !== player) {
            // 506.4: Changing controllers ends a permanent's participation in combat.
            if (this.zone instanceof Battlefield)
                CombatManager.removeFromCombat(this);
            this.currentController = player;
            this.controlledSinceTurn = game?.options ? game.turnNumber : -1;
        }
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

    set attachedTo(target: Permanent | undefined) {
        if (this.attachment === target)
            return;

        this.attachment = target;
        if (this.zone instanceof Battlefield)
            gameEventManager.effects.refreshAbilityGrants();
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

    canActivate(ability: Ability, actor: Player, payingManaCost = false) {
        return this.zone instanceof Battlefield && this.abilities.includes(ability) && ability.activator === actor
            && (game.priorityPlayer === actor || (payingManaCost && ability.def.isManaAbility))
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

    constructor(card: Card, private readonly spellController: Player, targets: readonly ActionTarget[],
        readonly chosenX = 0, readonly chosenMode?: number) {
        super(card, chosenMode);
        this.targets = [...targets];
        // 107.3a: X in the cost of a spell on the stack equals its announced value.
        if (this.variableManaSymbols)
            this.cost = ManaUtility.withX(this.cost, this.variableManaSymbols, chosenX);
    }

    override get controller() { return this.spellController; }

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
