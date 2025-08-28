import Game, {game} from "@engine/Game";
import Player from "@engine/Player";
import Card from "@engine/Card";
import {cardData} from "~/index";
import {FOREST, GRIZZLY_BEARS} from "@engine/tests/testData";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ChangeCardZone, GameEvent_DestroyPermanent, GameEvent_DrawCard} from "@engine/events";

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