import Card from "../../Card";
import {cardData} from "../../../index";
import {FOREST, GRIZZLY_BEARS} from "../testData";
import Game, {game} from "../../Game";
import Player from "../../Player";
import {expect} from "vitest";

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
    expect(card.activatedAbilities).toEqual(def.activated_abilities);

    expect(card.owner).toBe(player);
});

test("should load simple creature correctly", () => {
    const def = cardData[GRIZZLY_BEARS];
    const card = new Card(def, player);

    expect(card.def).toBe(def);
    expect(card.name).toBe(def.name);
    expect(card.type).toBe(def.type);
    expect(card.cost).toEqual([0, 0, 0, 0, 1, 0, 1]);
    expect(card.activatedAbilities).toEqual([]);
    expect(card.power).toBe(def.power);
    expect(card.toughness).toBe(def.toughness);

    expect(card.owner).toBe(player);
});