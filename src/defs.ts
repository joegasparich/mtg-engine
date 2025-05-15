export interface CardDef {
    name: string,
    image_url: string,
    oracle_text: string,
    type: CardType,
    cost: string, // {3}{G}{G}
    power: number,
    toughness: number,
    activated_abilities: ActivatedAbilityDef[],
    static_abilities: StaticAbilityDef[],
}

export enum CardType {
    Land = "Land",
    Creature = "Creature"
}

export interface ActivatedAbilityDef {
    cost: string, // Class name, might need to become defs
    effects: AbilityEffectDef[], // Class names, might need to become defs
    manaAbility: boolean
}

export interface StaticAbilityDef {
    keyword: Keyword,
    worker: string // Class name
}

export interface AbilityEffectDef {
    worker: string; // Class name
}

export enum Keyword {
    Flying = "Flying",
    Reach = "Reach",
}

export const KeywordMap: Record<Keyword, string> = {
    Flying: "StaticAbility_Flying", // Class name
    Reach: ""
};

export interface AbilityEffectDef_AddMana extends AbilityEffectDef {
    mana: string, // {3}{G}{G}
}