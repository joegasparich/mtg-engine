import { PlayerActions } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_PlayLand } from "@engine/events";
import gameEventManager,{ GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { FOREST,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

function addForestToHand(owner: Player) {
    const forest = new Card(cardData[FOREST], owner);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, owner.hand));
    return forest;
}

function startMainPhase() {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
}

test.each([StepIndex.Main, StepIndex.SecondMain])("plays the first land directly onto the battlefield in main phase step %s", step => {
    game.startGame();
    const forest = addForestToHand(player);
    gameEventManager.addEvent(new GameEvent_GoToStep(step));

    const [action] = playerActionManager.getCardActions(forest, player);
    const onPlay = vi.fn();
    const onMove = vi.fn();
    gameEventManager.onPerformed(GameEventType.PlayLand, onPlay);
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onMove);
    try {
        action.perform(player);
    } finally {
        gameEventManager.offPerformed(GameEventType.PlayLand, onPlay);
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onMove);
    }

    expect(onPlay).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ player, card: forest }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        card: forest,
        oldZone: player.hand,
        newZone: player.battlefield,
    }));
    expect(player.hand.cards).toHaveLength(0);
    expect(player.battlefield.cards).toEqual([forest]);
});

test("the casting event and stack reject lands", () => {
    game.startGame();
    const forest = addForestToHand(player);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

    gameEventManager.addEvent(new GameEvent_CastSpell(player, forest));
    expect(game.stack.spellCast(player, forest)).toBe(false);

    expect(forest.zone).toBe(player.hand);
    expect(game.stack.stack).toHaveLength(0);
    expect(playerActionManager.getCardActions(forest, player)).toHaveLength(1);
});

test("a land play requires an empty stack even if the action was already offered", () => {
    game.startGame();
    const forest = addForestToHand(player);
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [play] = playerActionManager.getCardActions(forest, player);

    game.stack.spellCast(player, bears);
    expect(playerActionManager.getCardActions(forest, player)).toHaveLength(0);
    play.perform(player);
    expect(forest.zone).toBe(player.hand);
    expect(bears.zone).toBe(game.stack);

    game.stack.resolveAll();
    play.perform(player);
    expect(forest.zone).toBe(player.battlefield);
});

test("both main phases share one land play, including previously offered actions", () => {
    game.startGame();
    const firstLand = addForestToHand(player);
    const secondLand = addForestToHand(player);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [firstPlay] = playerActionManager.getCardActions(firstLand, player);
    const [secondPlay] = playerActionManager.getCardActions(secondLand, player);

    firstPlay.perform(player);
    expect(playerActionManager.getCardActions(secondLand, player)).toHaveLength(0);
    secondPlay.perform(player);
    expect(secondLand.zone).toBe(player.hand);

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
    expect(playerActionManager.getCardActions(secondLand, player)).toHaveLength(0);
    gameEventManager.addEvent(new GameEvent_PlayLand(player, secondLand));

    expect(player.battlefield.cards).toEqual([firstLand]);
    expect(player.hand.cards).toEqual([secondLand]);
});

test("a rejected land play is skipped while the next event is recorded", () => {
    game.startGame();
    const forest = addForestToHand(player);
    const rejected = new GameEvent_PlayLand(player, forest);
    const completed = new GameEvent_Log(GameEventType.Log, "After the rejected land play");
    const onPlay = vi.fn();
    const onPerformed = vi.fn();
    const onRejectedCompletion = vi.fn();
    const onCompleted = vi.fn();
    const log = vi.mocked(console.log);
    const logStart = log.mock.calls.length;
    rejected.then(onRejectedCompletion);
    completed.then(onCompleted);

    gameEventManager.onPerformed(GameEventType.PlayLand, onPlay);
    gameEventManager.onPerformed(GameEventType.All, onPerformed);
    try {
        gameEventManager.addEvents([rejected, completed]);
    } finally {
        gameEventManager.offPerformed(GameEventType.PlayLand, onPlay);
        gameEventManager.offPerformed(GameEventType.All, onPerformed);
    }

    expect(forest.zone).toBe(player.hand);
    expect(onPlay).not.toHaveBeenCalled();
    expect(onRejectedCompletion).not.toHaveBeenCalled();
    expect(onPerformed).toHaveBeenCalledExactlyOnceWith(completed);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.slice(logStart)).toEqual([[`%cGameEvent: ${completed.label}`, "color: cyan;"]]);
});

test("a new turn restores the land play for the active player only", () => {
    const opponent = game.addPlayer([]);
    game.startGame();
    const firstLand = addForestToHand(player);
    const secondLand = addForestToHand(player);
    const opponentLand = addForestToHand(opponent);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [previousTurnPlay] = playerActionManager.getCardActions(secondLand, player);
    new PlayerActions.PlayCard(firstLand).perform(player);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    previousTurnPlay.perform(opponent);
    expect(secondLand.zone).toBe(player.hand);
    expect(opponent.battlefield.cards).toHaveLength(0);

    const [opponentPlay] = playerActionManager.getCardActions(opponentLand, opponent);
    opponentPlay.perform(opponent);
    expect(opponent.battlefield.cards).toEqual([opponentLand]);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [nextTurnPlay] = playerActionManager.getCardActions(secondLand, player);
    nextTurnPlay.perform(player);
    expect(player.battlefield.cards).toEqual([firstLand, secondLand]);
});

test("a spell action from the previous turn cannot spend either player's mana", () => {
    const opponent = game.addPlayer([]);
    startMainPhase();
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    player.manaPool[ManaColour.G] = 2;
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));
    const [action] = playerActionManager.getCardActions(bears, player);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    opponent.manaPool[ManaColour.G] = 2;
    player.manaPool[ManaColour.G] = 2;
    action.perform(opponent);
    action.perform(player);

    expect(bears.zone).toBe(player.hand);
    expect(opponent.manaPool[ManaColour.G]).toBe(2);
    expect(player.manaPool[ManaColour.G]).toBe(2);
});

test("should cast creature spell from hand (bypassing cost)", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
    gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));

    // Test stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check card entered battlefield
    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0]).toBe(bears);
});

// test("should cast instant spell from hand (bypassing cost)", () => {
//     gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], player), player.library));
//     gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], player), player.library));
//     gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], player), player.library));
//
//     const recall = new Card(cardData[ANCESTRAL_RECALL], player);
//     gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, player.hand));
//
//     const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
//     gameEventManager.addEvent(new GameEvent_CastSpell(player, recall, [player]));
//
//     // Test stack resolved properly
//     expect(cardEnteredStack).toHaveBeenCalledTimes(1);
//
//     // Check card entered graveyard
//     expect(player.graveyard.cards.length).toBe(1);
//     expect(player.graveyard.cards[0]).toBe(recall);
//
//     // Check effect resolved
//     expect(player.hand.cards.length).toBe(3);
// });

test("shouldn't play creature card from hand with insufficient mana", () => {
    startMainPhase();
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    // Check stack never resolved
    expect(cardEnteredStack).toHaveBeenCalledTimes(0);

    // Check card remained in hand
    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Check card did not enter battlefield
    expect(player.battlefield.cards.length).toBe(0);
});

test("should play creature card from hand with sufficient mana", () => {
    startMainPhase();
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 2;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

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
    startMainPhase();
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 3;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

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
    startMainPhase();
    const bears = new Card(cardData[GRIZZLY_BEARS], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

    expect(player.hand.cards.length).toBe(1);
    expect(player.hand.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 1;
    player.manaPool[ManaColour.Colourless] = 1;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    // Test stack resolved properly
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Test mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(player.manaPool[ManaColour.Colourless]).toBe(0);

    expect(player.battlefield.cards.length).toBe(1);
    expect(player.battlefield.cards[0].def).toBe(cardData[GRIZZLY_BEARS]);
});
