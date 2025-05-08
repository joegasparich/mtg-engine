export interface CardDef {
    name: string,
    image_url: string,
    oracle_text: string,
    type: CardType,
    cost: string, // {3}{G}{G}
    activated_abilities: ActivatedAbilityDef[]
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
    effects: AbilityEffectData[]
}

export enum AbilityEffectType {
    AddMana = "AbilityEffect_AddMana"
}

export interface AbilityEffectData {
    type: AbilityEffectType,
}

export interface AbilityEffectData_AddMana extends AbilityEffectData {
    W: number
    U: number
    B: number
    R: number
    G: number
    C: number
}