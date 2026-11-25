type ClassName = string;

export interface CardDef {
    name: string,
    image_url: string,
    oracle_text: string,
    type: CardType,
    subtypes?: string[],
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
    Enchantment = "Enchantment",
}

export const cardColours = ["W", "U", "B", "R", "G"] as const;
export type CardColour = (typeof cardColours)[number];

export type TargetValidator = {
    cardType?: CardType;
    cardSubtype?: string;
    tapped?: boolean;
};

export type AbilityDef = {
    activateString?: string;
    keyword?: Keyword;
    isManaAbility?: boolean;
    parts: Record<ClassName, object> & {
        SimpleAura?: { targetValidator?: TargetValidator };
    };
};

export enum Keyword {
    Banding = "banding",
    Defender = "defender",
    Flying = "flying",
    Reach = "reach",
}
