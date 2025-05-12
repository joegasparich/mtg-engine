export interface CardDef {
    name: string,
    image_url: string,
    oracle_text: string,
    type: CardType,
    cost: string, // {3}{G}{G}
    activated_abilities: ActivatedAbilityDef[],
    power: number,
    toughness: number,
}

export enum CardType {
    Land = "Land",
    Creature = "Creature"
}

export enum ActivatedAbilityCostType {
    Tap = "Tap"
}

export interface ActivatedAbilityDef {
    cost: ActivatedAbilityCostType,
    effects: AbilityEffectDef[],
    manaAbility: boolean
}

export enum AbilityEffectType {
    AddMana = "AbilityEffect_AddMana"
}

export interface AbilityEffectDef {
    type: AbilityEffectType,
}

export interface AbilityEffectDef_AddMana extends AbilityEffectDef {
    mana: string, // {3}{G}{G}
}