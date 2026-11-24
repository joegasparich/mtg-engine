import { PlayerActions } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_ChangeCardZone,GameEvent_GoToStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
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

test("playing a spell can use mana produced immediately by autopay", () => {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const mountain = new Card(cardData[MOUNTAIN], player);
    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, player.battlefield));
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, player.hand));

    new PlayerActions.PlayCard(goblins).perform(player);

    expect(mountain.tapped).toBe(true);
    expect(player.manaPool[ManaColour.R]).toBe(0);
    expect(goblins.zone).toBe(player.battlefield);
});

test("the playability highlight counts each untapped land once", () => {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    const pool = player.manaPool;
    expect(playerActionManager.cardActionsForUI.has(bears)).toBe(false);
    expect(playerActionManager.getCardActions(bears, player)).toHaveLength(0);
    expect(player.manaPool).toBe(pool);
    expect(pool).toEqual([0, 0, 0, 0, 0, 0]);

    const secondForest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(secondForest, player.battlefield));

    const [action] = playerActionManager.cardActionsForUI.get(bears);
    action.perform(player);
    expect(bears.zone).toBe(player.battlefield);
    expect(forest.tapped).toBe(true);
    expect(secondForest.tapped).toBe(true);
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

test("infinite mana enables spells without spending mana or tapping lands, and can be turned off", () => {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const forest = new Card(cardData[FOREST], player);
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    const another = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));
    for (const spell of [bears, another])
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell, player.hand));
    expect(game.infiniteMana).toBe(false);
    expect(playerActionManager.cardActionsForUI.has(bears)).toBe(false);

    game.infiniteMana = true;
    playerActionManager.refreshCardActionsForUI();
    expect(playerActionManager.cardActionsForUI.has(bears)).toBe(true);
    player.manaPool[ManaColour.R] = 1;
    new PlayerActions.PlayCard(bears).perform(player);
    expect(bears.zone).toBe(player.battlefield);
    expect(forest.tapped).toBe(false);
    expect(player.manaPool[ManaColour.R]).toBe(1);

    game.infiniteMana = false;
    player.manaPool[ManaColour.R] = 0;
    playerActionManager.refreshCardActionsForUI();
    expect(playerActionManager.cardActionsForUI.has(another)).toBe(false);
    new PlayerActions.PlayCard(another).perform(player);
    expect(another.zone).toBe(player.hand);
});
