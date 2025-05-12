import Game, {game} from "../../Game";
import Player from "../../Player";
import {cardData} from "../../../index";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_ChangeCardZone, GameEvent_DrawCard} from "../../events";
import {expect} from "vitest";

const FOREST = cardData.findIndex(c => c.name == "Forest");

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should add card to library", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.library));

    expect(player.library.cards.length).toBe(1);
    expect(player.library.cards[0].def).toBe(cardData[FOREST]);
});

test("should add card to hand", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[FOREST]);
});

test("should add card to battlefield", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[FOREST]);
});

test("should draw card from library", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.library));

    gameEventManager.addEvent(new GameEvent_DrawCard(player));

    expect(player.library.cards.length).toBe(0);
    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[FOREST]);
});