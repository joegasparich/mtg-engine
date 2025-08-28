import Player from "@engine/Player";
import Game, {game} from "@engine/Game";
import {cardData} from "~/index";
import {FOREST, GRIZZLY_BEARS} from "@engine/tests/testData";
import Card from "@engine/Card";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should load land correctly", () => {
    const def = cardData[FOREST];
    const card = new Card(def, player);

    expect(card.def).toBe(def);
    expect(card.name).toBe(def.name);
    expect(card.type).toBe(def.type);
    expect(card.cost).toBe(undefined);
    expect(card.abilities[0].def).toEqual(def.abilities[0]);

    expect(card.owner).toBe(player);
});

test("should load simple creature correctly", () => {
    const def = cardData[GRIZZLY_BEARS];
    const card = new Card(def, player);

    expect(card.def).toBe(def);
    expect(card.name).toBe(def.name);
    expect(card.type).toBe(def.type);
    expect(card.cost).toEqual([0, 0, 0, 0, 1, 0, 1]);
    expect(card.abilities).toEqual([]);
    expect(card.power).toBe(def.power);
    expect(card.toughness).toBe(def.toughness);

    expect(card.owner).toBe(player);
});