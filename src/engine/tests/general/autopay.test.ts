import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,MOUNTAIN } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("canAutoPay should be true", () => {
    const mountain = new Card(cardData[MOUNTAIN], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, player.battlefield));

    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, player.hand));

    const canAutoPay = playerActionManager.canAutoPay(goblins, player);
    expect(canAutoPay).toBe(true);
});

test("canAutoPay should be false", () => {
    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, player.hand));

    const canAutoPay = playerActionManager.canAutoPay(goblins, player);
    expect(canAutoPay).toBe(false);
});

test("autoPay should tap mountain", () => {
    const mountain = new Card(cardData[MOUNTAIN], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, player.battlefield));

    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, player.hand));

    expect(mountain.tapped).toBe(false);
    playerActionManager.autoPay(goblins, player);
    expect(mountain.tapped).toBe(true);
});

test("autoPay uses existing mana in pool first", () => {
    const mountain = new Card(cardData[MOUNTAIN], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, player.battlefield));

    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, player.hand));

    ManaUtility.addMana(player.manaPool, [0, 0, 0, 1, 0, 0]);

    expect(mountain.tapped).toBe(false);
    playerActionManager.autoPay(goblins, player);
    expect(mountain.tapped).toBe(false);
});

test("autoPay uses existing mana and land", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    const grizzlyBears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(grizzlyBears, player.hand));

    ManaUtility.addMana(player.manaPool, [0, 0, 0, 0, 0, 1]);

    const canAutoPay = playerActionManager.canAutoPay(grizzlyBears, player);
    expect(canAutoPay).toBe(true);

    expect(forest.tapped).toBe(false);
    playerActionManager.autoPay(grizzlyBears, player);
    expect(forest.tapped).toBe(true);
});
