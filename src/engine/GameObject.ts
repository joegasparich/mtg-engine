import type { ActionTarget } from "@engine/actions";
import type Card from "@engine/Card";
import { Ability,makeAbility } from "@engine/abilities";
import { getBasicLandMana } from "@engine/abilities/BasicLandMana";
import { AbilityPart_Target } from "@engine/abilities/parts/AbilityPart_Target";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import { GameEvent_CheckAttachment,GameEvent_CheckBasicLandType } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager,{ type GameEvent } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaColour,ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { Battlefield,Zone } from "@engine/Zone";
import { type AbilityDef,type BasicLandType,type CardColour,cardColours,CardType,Keyword } from "~/defs";

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
    readonly controller?: Player;
    get owner() { return this.card.owner; }
    get def() { return this.card.def; }
    get logName() { return `${this.name} (${this.id})`; }
    get resolvedDamageSource(): Permanent | undefined { return undefined; }

    name: string;
    private baseType: CardType;
    private baseSubtypes: readonly string[];
    cost?: ManaCost;
    readonly variableManaSymbols: number;
    colours: ReadonlySet<CardColour>;
    private basePower: number;
    private baseToughness: number;
    private baseAbilities: readonly Ability[];
    private spellModeAbilities?: Map<number, readonly Ability[]>;
    private readonly activeBaseAbilities = new Set<Ability>();
    private basicLandAbilities?: Map<AbilityDef, Ability>;
    private readonly grantedAbilities = new Set<Ability>();

    constructor(readonly card: Card, chosenMode?: number) {
        super();
        const def = card.def;
        this.name = def.name;
        this.baseType = def.type;
        this.baseSubtypes = [...(def.subtypes ?? [])];
        this.power = def.power;
        this.toughness = def.toughness;
        if (def.cost)
            this.cost = [...ManaUtility.parseManaString<ManaCost>(def.cost)];
        this.variableManaSymbols = ManaUtility.countVariableSymbols(def.cost);
        // 202.2: The coloured symbols in the mana cost determine the object's starting colours.
        this.colours = new Set(cardColours.filter(colour => this.cost?.[ManaColour[colour]] > 0));
        this.baseAbilities = (def.abilities ?? []).map(ability => makeAbility(ability, this));
        if (chosenMode !== undefined)
            this.baseAbilities = [...this.baseAbilities, ...this.getSpellModeAbilities(chosenMode)];
    }

    get type() { return this.baseType; }

    set type(type: CardType) {
        this.baseType = type;
        this.refreshBaseAbilities();
        if (this.zone instanceof Battlefield)
            gameEventManager.effects.refreshAbilityGrants();
    }

    get subtypes(): readonly string[] {
        const replacement = this.basicLandTypeOverride;
        return replacement ? [replacement] : this.baseSubtypes;
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

    private get basicLandTypeOverride(): BasicLandType | undefined {
        if (this.type !== CardType.Land || !(this.zone instanceof Battlefield))
            return;

        const check = new GameEvent_CheckBasicLandType(this);
        gameEventManager.checkEvent(check);
        return check.replacement;
    }

    get power(): number {
        return gameEventManager.effects.getModifiedPowerToughness(this, "power", this.basePower);
    }

    set power(power: number) { this.basePower = power; }

    get toughness(): number {
        return gameEventManager.effects.getModifiedPowerToughness(this, "toughness", this.baseToughness);
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
        if (this.type !== CardType.Land)
            return this.baseAbilities;

        // 305.6–7: Land subtypes give intrinsic mana abilities. Setting a basic land type replaces
        // the old subtypes and rules-text abilities, while externally granted abilities still apply.
        const replacement = this.basicLandTypeOverride;
        const abilities = replacement ? [] : [...this.baseAbilities];
        for (const subtype of new Set(replacement ? [replacement] : this.baseSubtypes)) {
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
        if (this.type !== CardType.Instant && (this.owner !== game.currentTurnPlayer() || game.stack.objects.length
            || (game.currentStepIndex !== StepIndex.Main && game.currentStepIndex !== StepIndex.SecondMain)))
            return false;

        if (this.type === CardType.Land)
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
            const target = ability.parts.find(part => part instanceof AbilityPart_Target);
            if (target)
                return target;
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
    private attachment?: Permanent;
    tapped = false;
    damageTaken = 0;

    constructor(card: Card, override controller: Player, attachedTo?: Permanent) {
        super(card);
        this.attachment = attachedTo;
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

    canActivate(ability: Ability, payingManaCost = false) {
        return this.zone === this.controller.battlefield
            && (game.priorityPlayer === this.controller || (payingManaCost && ability.def.isManaAbility))
            && this.abilities.includes(ability) && ability.activatable && ability.canActivate();
    }

    hasLegalAttachment(): boolean {
        return !!this.attachedTo && this.canAttachTo(this.attachedTo);
    }

    checkState(actions: GameEvent[]) {
        super.checkState(actions);
        if (this.type !== CardType.Creature || !(this.zone instanceof Battlefield))
            return;

        // 704.5f–g: Zero toughness puts a creature into the graveyard. Lethal damage destroys it.
        if (this.toughness <= 0)
            actions.push(new GameEvent_ChangeCardZone(this, this.owner.graveyard));
        else if (this.toughness > 0 && this.damageTaken >= this.toughness)
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

    constructor(card: Card, override readonly controller: Player, targets: readonly ActionTarget[],
        readonly chosenX = 0, readonly chosenMode?: number) {
        super(card, chosenMode);
        this.targets = [...targets];
        // 107.3a: X in the cost of a spell on the stack equals its announced value.
        if (this.variableManaSymbols)
            this.cost = ManaUtility.withX(this.cost, this.variableManaSymbols, chosenX);
    }
}

export class StackAbility extends GameObject {
    readonly ability: Ability;

    constructor(readonly controller: Player, readonly source: CardObject, ability: Ability,
        private readonly signal: string, inputs: Ability["slate"] = {}) {
        super();
        // 113.7a: Each occurrence resolves independently of its source and other occurrences.
        this.ability = makeAbility(ability.def, source, ability.grantedBy);
        for (const [key, value] of Object.entries({ ...ability.slate, ...inputs }))
            this.ability.slate[key] = Array.isArray(value) ? [...value] : value;
        this.ability.slate.CONTROLLER = [controller];
    }

    resolve() {
        if (this.zone)
            this.ability.fireSignal(this.signal);
    }
}
