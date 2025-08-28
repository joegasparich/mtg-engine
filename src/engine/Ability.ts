import {ActionTarget} from "./actions";
import gameEventManager, {GameEventType} from "./events/GameEventManager";
import {autobind} from "../utility/typeUtility";
import {GameEvent_ChangeCardZone, GameEvent_TapCard} from "./events";
import {Battlefield} from "./Zone";
import {AbilityDef, CardType} from "../defs";
import Card from "./Card";
import {ManaAmount, ManaUtility} from "./mana";

type GrammarKey = string;

export function makeAbility(def: AbilityDef, card: Card): Ability {
    const ability = new Ability(card);

    ability.def = def;

    for (const className in def) {
        const part = new AbilityParts[className]();
        Object.assign(part, def[className]);
        ability.addPart(part);
    }

    return ability;
}

abstract class AbilityPart {
    ability: Ability;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup() {}

    onSignalFired(signal: string) {}
}

abstract class AbilityPart_Activate extends AbilityPart {
    outSignal = "default";

    canActivate(card: Card): boolean { return false; }
    payCost(card: Card) {}
    resolve() {
        this.ability.fireSignal(this.outSignal);
    }
}

class AbilityPart_Activate_Tap extends AbilityPart_Activate {
    canActivate(card: Card): boolean {
        return !card.tapped;
    }

    payCost(card: Card): void {
        gameEventManager.addEvent(new GameEvent_TapCard(card));

        super.payCost(card);
    }
}

abstract class AbilityPart_Trigger extends AbilityPart {
    outSignal = "default";

    onTrigger() {
        this.ability.fireSignal(this.outSignal);
    }
}

class AbilityPart_Trigger_Enters extends AbilityPart_Trigger {
    type: CardType;
    storeAs: GrammarKey;

    setup(ability: Ability) {
        super.setup(ability);

        gameEventManager.on(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    cleanup() {
        gameEventManager.off(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        if (!(event.newZone instanceof Battlefield))
            return;

        if (event.card.type != this.type)
            return;

        if (this.storeAs)
            this.ability.slate[this.storeAs] = event.card;

        this.onTrigger();
    }
}

abstract class AbilityPart_Effect extends AbilityPart {
    inSignal = "default";

    onSignalFired(signal: string) {
        if (signal === this.inSignal)
            this.perform();
    }

    perform() {}
}

class AbilityPart_Effect_DealDamage extends AbilityPart_Effect {
    source: GrammarKey;
    amount: number;
    target: GrammarKey;

    perform() {
        const source = resolveAbilityGrammar(this.source, this.ability);
        const target = resolveAbilityGrammar(this.target, this.ability);

        // gameEventManager.addEvent(new GameEvent_DealDamage(source, target, this.amount));
    }
}

class AbilityPart_Effect_AddMana extends AbilityPart_Effect {
    target: GrammarKey;
    mana: string;

    perform() {
        const player = resolveAbilityGrammar(this.target, this.ability);
        const mana = ManaUtility.parseManaString(this.mana);

        // gameEventManager.addEvent(new GameEvent_AddMana(player, mana));
    }
}


type AbilityPartConstructor = new () => AbilityPart;
const AbilityParts: Record<string, AbilityPartConstructor> = {
    AbilityPart_Activate_Tap: AbilityPart_Activate_Tap,
    AbilityPart_Trigger_Enters: AbilityPart_Trigger_Enters,
    AbilityPart_Effect_AddMana: AbilityPart_Effect_AddMana,
    AbilityPart_Effect_DealDamage: AbilityPart_Effect_DealDamage
};

type SlateVar = "THIS"

// This class assumes that once its parts are set up it won't change
// For caching purposes
export class Ability {
    def: AbilityDef;
    parts: AbilityPart[] = [];
    slate: Record<SlateVar | string, ActionTarget> = {};

    constructor(card: Card) {
        this.slate["THIS"] = card;
    }

    addPart(part: AbilityPart) {
        this.parts.push(part);
        part.setup(this);
    }

    fireSignal(signal: string) {
        this.parts.forEach(part => part.onSignalFired(signal));
    }

    cleanup() {
        this.parts.forEach(part => part.cleanup());
    }

    //-- Getters --//

    private _activated: boolean;
    get activated() { return this._activated ??= this.parts.some(p => p instanceof AbilityPart_Activate); }

    canActivate(card: Card): boolean {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.canActivate(card));
    }

    payCost(card: Card) {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.payCost(card));
    }

    resolve() {
        return this.parts
            .filter(p => p instanceof AbilityPart_Activate)
            .every((p: AbilityPart_Activate) => p.resolve());
    }

    getPotentialMana(): ManaAmount {
        const mana: ManaAmount = [0, 0, 0, 0, 0, 0];

        this.parts
            .filter(p => p instanceof AbilityPart_Effect_AddMana)
            .forEach((p: AbilityPart_Effect_AddMana) => ManaUtility.addMana(mana, ManaUtility.parseManaString(p.mana)));

        return mana;
    }
}

function resolveAbilityGrammar(key: GrammarKey, ability: Ability): ActionTarget {
    const parts = key.split(".");

    let result = null;

    for (const part of parts) {
        if (ability.slate[part])
            result = ability.slate[part];
        else if (part === "controller")
            result = (result as Card)?.controller;
        else if (part === "owner")
            result = (result as Card)?.owner;
    }

    return result;
}