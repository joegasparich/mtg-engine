import { loadTextures } from "pixi.js";
import { cardData } from "~/index";

test("Pixi recognizes the artwork URL for every card", () => {
    const unsupported = cardData.filter(card => !loadTextures.test(card.image_url));
    expect(unsupported.map(card => card.name)).toEqual([]);
});
