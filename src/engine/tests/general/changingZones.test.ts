import Game, {game} from "../../Game";
import Player from "../../Player";
import {cardData} from "../../../index";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_ChangeCardZone, GameEvent_DrawCard} from "../../events";
import {FOREST, GRIZZLY_BEARS} from "../testData";
import {expect} from "vitest";
import {GameEvent_DestroyPermanent} from "../../events/GameEvent_DestroyPermanent";

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
    expect(player.library.cards[0]).toBe(forest);
    expect(forest.zone).toBe(player.library);
});

test("should add card to hand", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0]).toBe(forest);
    expect(forest.zone).toBe(player.hand);
});

test("should add card to battlefield", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0]).toBe(forest);
    expect(forest.zone).toBe(player.battlefield);
});

test("should draw card from library", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.library));

    gameEventManager.addEvent(new GameEvent_DrawCard(player));

    expect(player.library.cards.length).toBe(0);
    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0]).toBe(forest);
});

test("should go to graveyard when destroyed", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.battlefield));

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(bears));

    expect(player.battlefield.cards.length).toBe(0);
    expect(player.graveyard.cards.length).toBe(1);
    expect(player.graveyard.cards[0]).toBe(bears);
});