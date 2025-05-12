import Game, {game} from "../../Game";
import {cardData} from "../../../index";
import {expect} from "vitest";
import {StepIndex} from "../../Step";
import {BASIC_DECK, FOREST, GRIZZLY_BEARS} from "../testData";

test("should start game and add player", () => {
    Game.init();
    const player = game.addPlayer(BASIC_DECK);

    expect(game);

    game.startGame();

    expect(game.currentStepIndex).toBe(StepIndex.Untap);
    expect(game.turnNumber).toBe(0);

    // Check player added
    expect(player);
    expect(game.players.length).toBe(1);
    expect(game.players[0]).toBe(player);
    expect(game.currentTurnPlayerID).toBe(0);
    expect(game.currentTurnPlayer()).toBe(player);
    expect(game.activePlayer()).toBe(null); // No priority in untap
});

test("should add two players", () => {
    Game.init();
    const playerOne = game.addPlayer(BASIC_DECK);
    const playerTwo = game.addPlayer(BASIC_DECK);

    game.startGame();

    // Check both players were added
    expect(playerOne);
    expect(playerTwo);
    expect(game.players.length).toBe(2);
    expect(game.players[0]).toBe(playerOne);
    expect(game.players[1]).toBe(playerTwo);
});

test("should load deck", () => {
    Game.init();
    const deck: number[] = [FOREST];
    let player = game.addPlayer(deck);

    // Check player library loaded
    expect(player.library.cards.length).toBe(1);
    expect(player.library.cards[0].def).toBe(cardData[FOREST]);

    const deckTwo: number[] = [FOREST, GRIZZLY_BEARS, FOREST];
    player = game.addPlayer(deckTwo);

    // Check multiple cards loaded
    expect(player.library.cards.length).toBe(3);
    expect(player.library.cards[0].def).toBe(cardData[FOREST]);
    expect(player.library.cards[1].def).toBe(cardData[GRIZZLY_BEARS]);
    expect(player.library.cards[2].def).toBe(cardData[FOREST]);
});

const SEVEN_FORESTS = [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST, FOREST];
test("should draw 7 cards", () => {
    Game.init();
    const player = game.addPlayer(SEVEN_FORESTS);

    game.startGame();

    // Check we drew exactly seven cards
    expect(player.hand.cards.length).toBe(7);
    expect(player.library.cards.length).toBe(0);
});