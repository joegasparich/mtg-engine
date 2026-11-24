import { GameEvent_DestroyPermanent,GameEvent_DrawCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { addTestCard,FOREST,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should add card to library", () => {
    const forest = addTestCard(cardData[FOREST], player, player.library);

    expect(player.library.objects.length).toBe(1);
    expect(player.library.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.library);
});

test("should add card to hand", () => {
    const forest = addTestCard(cardData[FOREST], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.hand);
});

test("should add card to battlefield", () => {
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);

    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.battlefield);
});

test("should draw card from library", () => {
    const forest = addTestCard(cardData[FOREST], player, player.library);

    gameEventManager.addEvent(new GameEvent_DrawCard(player));

    expect(player.library.objects.length).toBe(0);
    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].card).toBe(forest.card);
    expect(forest.retired).toBe(true);
});

test("should go to graveyard when destroyed", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(bears));

    expect(player.battlefield.objects.length).toBe(0);
    expect(player.graveyard.objects.length).toBe(1);
    expect(player.graveyard.objects[0].card).toBe(bears.card);
    expect(bears.retired).toBe(true);
});
