import { GameEvent_DestroyPermanent,GameEvent_DrawCard,GameEvent_DrawCards } from "@engine/events";
import gameEventManager,{ type EventCheck } from "@engine/events/GameEventManager";
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

test("a draw instruction can be changed before its individual draws are checked", () => {
    const bottom = addTestCard(cardData[FOREST], player, player.library);
    const middle = addTestCard(cardData[FOREST], player, player.library);
    const top = addTestCard(cardData[GRIZZLY_BEARS], player, player.library);
    const libraryTops: (typeof top)[] = [];
    const replaceDraws = (check: EventCheck) => {
        for (const event of check.events) {
            if (event instanceof GameEvent_DrawCards) {
                check.replace(event, new GameEvent_DrawCards(player, 3));
            } else if (event instanceof GameEvent_DrawCard) {
                libraryTops.push(player.library.getTopCard());
                if (libraryTops.length === 2)
                    check.removeWhere(candidate => candidate === event);
            }
        }
    };
    gameEventManager.onCheck(replaceDraws);
    try {
        gameEventManager.addEvent(new GameEvent_DrawCards(player, 2));
    } finally {
        gameEventManager.offCheck(replaceDraws);
    }

    expect(libraryTops).toEqual([top, middle, middle]);
    expect(player.hand.objects.map(object => object.card)).toEqual([top.card, middle.card]);
    expect(player.library.objects).toEqual([bottom]);
});

test("should go to graveyard when destroyed", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(bears));

    expect(player.battlefield.objects.length).toBe(0);
    expect(player.graveyard.objects.length).toBe(1);
    expect(player.graveyard.objects[0].card).toBe(bears.card);
    expect(bears.retired).toBe(true);
});
