import { BasicLandType } from "~/defs";

export enum WordKind {
    BasicLandType = "land",
}

export type WordReplacement = {
    readonly kind: WordKind.BasicLandType;
    // Omitting the source word replaces every word of this kind.
    readonly from?: BasicLandType;
    readonly to: BasicLandType;
};

const basicLandTypes = new Set<string>(Object.values(BasicLandType));

export function isBasicLandType(value: unknown): value is BasicLandType {
    return typeof value === "string" && basicLandTypes.has(value);
}

export function readWord(word: string, kind: WordKind, replacements: readonly WordReplacement[]) {
    for (const replacement of replacements) {
        if (replacement.kind === kind && (replacement.from === undefined || word === replacement.from))
            word = replacement.to;
    }
    return word;
}

// CR 612.2: Only annotated words are rules operands. Identical words in names are literal text.
export function renderRulesText(template: string, replacements: readonly WordReplacement[] = []) {
    return template.replace(/\{land:(\w+)(?::(plural|walk|article))?\}/g, (_, printed: string, form?: string) => {
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
