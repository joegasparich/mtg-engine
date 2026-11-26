import { expect, test } from "vitest";
import { formatManaPool } from "@ui/manaPool";

test("shows when the mana pool is empty", () => {
    expect(formatManaPool([0, 0, 0, 0, 0, 0])).toBe("Empty");
});

test("lists available mana in colour order, including colourless", () => {
    expect(formatManaPool([1, 2, 3, 4, 5, 6])).toBe("1 white · 2 blue · 3 black · 4 red · 5 green · 6 colourless");
    expect(formatManaPool([0, 0, 0, 0, 12, 0])).toBe("12 green");
});
