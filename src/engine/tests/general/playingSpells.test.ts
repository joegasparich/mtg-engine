import {cardData} from "../../../index";
import Player from "../../Player";
import Game, {game} from "../../Game";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_CastSpell, GameEvent_ChangeCardZone} from "../../events";
import {ManaColour} from "../../mana";
import {PlayerAction_PlayCard} from "../../PlayerAction";
import {FOREST, GRIZZLY_BEARS} from "../testData";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should play land from hand", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[FOREST]);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
    gameEventManager.addEvent(new GameEvent_CastSpell(player, forest));

    // Check stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check card left hand
    expect(player.hand.cards.length).toBe(0);

    // Check card entered battlefield
    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[FOREST]);
});

test("should cast creature spell from hand (bypassing cost)", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
    gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));

    // Test stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check card entered battlefield
    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);
});

test("shouldn't play creature card from hand with insufficient mana", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    const action = new PlayerAction_PlayCard(bears);
    action.perform(player);

    // Check stack never resolved
    expect(cardEnteredStack).toHaveBeenCalledTimes(0);

    // Check card remained in hand
    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Check card did not enter battlefield
    expect(player.battlefield.cards.length).toBe(0);
});

test("should play creature card from hand with sufficient mana", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 2;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    const action = new PlayerAction_PlayCard(bears);
    action.perform(player);

    // Check stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(0);

    // Check card left hand
    expect(player.hand.cards.length).toBe(0);

    // Check card entered battlefield
    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);
});

test("should play creature card from hand with excess mana", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 3;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    const action = new PlayerAction_PlayCard(bears);
    action.perform(player);

    // Check stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(1);

    // Check card left hand
    expect(player.hand.cards.length).toBe(0);

    // Check card entered battlefield
    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);
});

test("should play creature card from hand with generic mana", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 1;
    player.manaPool[ManaColour.Colourless] = 1;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    const action = new PlayerAction_PlayCard(bears);
    action.perform(player);

    // Test stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Test mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(player.manaPool[ManaColour.Colourless]).toBe(0);

    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);
});