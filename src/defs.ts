type ClassName = string;

export interface CardDef {
    name: string,
    image_url: string,
    oracle_text: string,
    type: CardType,
    cost: string, // {3}{G}{G}
    power: number,
    toughness: number,
    abilities: AbilityDef[],
}

export enum CardType {
    Land = "Land",
    Creature = "Creature",
    Sorcery = "Sorcery",
    Instant = "Instant",
    Artifact = "Artifact",
}

export type AbilityDef = Record<ClassName, object> & {
    keyword: Keyword;
};

export enum Keyword {
    Flying = "Flying",
    Reach = "Reach",
}

export const KeywordMap: Record<Keyword, ClassName> = {
    Flying: "StaticAbility_Flying",
    Reach: ""
};
