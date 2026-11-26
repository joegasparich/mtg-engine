import { ManaColour, type ManaAmount } from "@engine/mana";

const manaTypes = [
    [ManaColour.W, "white"],
    [ManaColour.U, "blue"],
    [ManaColour.B, "black"],
    [ManaColour.R, "red"],
    [ManaColour.G, "green"],
    [ManaColour.Colourless, "colourless"],
] as const;

export function formatManaPool(pool: Readonly<ManaAmount>): string {
    const amounts = manaTypes
        .filter(([colour]) => pool[colour] > 0)
        .map(([colour, name]) => `${pool[colour]} ${name}`);
    return amounts.join(" · ") || "Empty";
}
