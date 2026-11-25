import { type AbilityDef,BasicLandType,type CardColour } from "~/defs";

const basicLandColours: Record<BasicLandType, CardColour> = {
    [BasicLandType.Plains]: "W",
    [BasicLandType.Island]: "U",
    [BasicLandType.Swamp]: "B",
    [BasicLandType.Mountain]: "R",
    [BasicLandType.Forest]: "G",
};

const basicLandMana = new Map<string, AbilityDef>(Object.entries(basicLandColours).map(([subtype, colour]) => [subtype, {
    activateString: "Tap for mana",
    isManaAbility: true,
    parts: {
        AbilityPart_Activate_Tap: {},
        AbilityPart_Effect_AddMana: { target: "THIS.controller", mana: `{${colour}}` },
    },
}]));

export function getBasicLandMana(subtype: string): AbilityDef | undefined {
    return basicLandMana.get(subtype);
}
