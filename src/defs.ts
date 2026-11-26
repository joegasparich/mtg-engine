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
    spellModes?: readonly SpellModeDef[],
}

export type SpellModeDef = {
    text: string;
    abilities: readonly AbilityDef[];
};

export enum CardType {
    Land = "Land",
    Creature = "Creature",
    Sorcery = "Sorcery",
    Instant = "Instant",
    Artifact = "Artifact",
    Enchantment = "Enchantment",
}

export enum AttachmentSubtype {
    Aura = "Aura",
}

export enum BasicLandType {
    Plains = "Plains",
    Island = "Island",
    Swamp = "Swamp",
    Mountain = "Mountain",
    Forest = "Forest",
}

export const cardColours = ["W", "U", "B", "R", "G"] as const;
export type CardColour = (typeof cardColours)[number];

export type TargetValidator = {
    cardType?: CardType;
    cardTypes?: readonly CardType[];
    onBattlefield?: boolean;
    cardSubtype?: string;
    colour?: CardColour;
    // Match the subtype before continuous type changes are applied.
    baseSubtype?: string;
    tapped?: boolean;
    blocking?: boolean;
    unblocked?: boolean;
};

export enum AbilityActivator {
    Owner = "Owner",
}

export type AbilityDef = {
    activateString?: string;
    activator?: AbilityActivator;
    keyword?: Keyword;
    isManaAbility?: boolean;
    parts: Record<ClassName, object> & {
        SimpleAura?: { targetValidator?: TargetValidator };
    };
};

export enum Keyword {
    Banding = "banding",
    Defender = "defender",
    DoubleStrike = "double strike",
    FirstStrike = "first strike",
    Flying = "flying",
    Indestructible = "indestructible",
    Islandwalk = "islandwalk",
    Reach = "reach",
    Vigilance = "vigilance",
}
