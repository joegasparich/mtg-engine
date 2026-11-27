import { BasicLandType,type CardColour,colourNames,isCardColour } from "~/defs";

export enum WordKind {
    BasicLandType = "land",
    Colour = "color",
}

export type WordReplacement = {
    readonly kind: WordKind.BasicLandType;
    // Omitting the source word replaces every word of this kind.
    readonly from?: BasicLandType;
    readonly to: BasicLandType;
} | {
    readonly kind: WordKind.Colour;
    readonly from?: CardColour;
    readonly to: CardColour;
};

const basicLandTypes = new Set<string>(Object.values(BasicLandType));

export function isBasicLandType(value: unknown): value is BasicLandType {
    return typeof value === "string" && basicLandTypes.has(value);
}

export function readWord(word: CardColour, kind: WordKind.Colour, replacements: readonly WordReplacement[]): CardColour;
export function readWord(word: BasicLandType, kind: WordKind.BasicLandType, replacements: readonly WordReplacement[]): BasicLandType;
export function readWord(word: string, kind: WordKind, replacements: readonly WordReplacement[]) {
    for (const replacement of replacements) {
        if (replacement.kind === kind && (replacement.from === undefined || word === replacement.from))
            word = replacement.to;
    }
    return word;
}

// CR 612.2: Only annotated words are rules operands. Identical words in names are literal text.
export function renderRulesText(template: string, replacements: readonly WordReplacement[] = []) {
    const text = template.replace(/\{color:(\w+)(:capital)?\}/g, (_, printed: string, capital?: string) => {
        if (!isCardColour(printed))
            throw new Error(`Unknown colour in rules text: ${printed}`);
        const name = colourNames[readWord(printed, WordKind.Colour, replacements)];
        return capital ? name : name.toLowerCase();
    });
    return text.replace(/\{land:(\w+)(?::(plural|walk|article))?\}/g, (_, printed: string, form?: string) => {
        if (!isBasicLandType(printed))
            throw new Error(`Unknown basic land type in rules text: ${printed}`);
        const word = readWord(printed, WordKind.BasicLandType, replacements);
        switch (form) {
            case "plural": return word === BasicLandType.Plains ? word : word + "s";
            case "walk": return word.toLowerCase() + "walk";
            case "article": return (word === BasicLandType.Island ? "an " : "a ") + word;
            default: return word;
        }
    });
}
