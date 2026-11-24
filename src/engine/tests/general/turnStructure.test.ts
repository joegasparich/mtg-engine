import playerActionManager,{ TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_ChangeCardZone,GameEvent_DrawCard,GameEvent_GoToNextPhase,GameEvent_GoToNextStep,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_StepStart } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { BASIC_DECK,FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,MOUNTAIN } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer(BASIC_DECK);
});

test("should do all steps", () => {
    game.startGame({allowAutoSkip: false});

    expect(game.currentStepIndex).toBe(StepIndex.Untap);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.Upkeep);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.Draw);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.BeginningOfCombat);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.DeclareAttackers);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.DeclareBlockers);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.EndOfCombat);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.SecondMain);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.End);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.Cleanup);
    expect(game.activePlayer()).toBeNull();
});

test("should advance to specific step", () => {
    game.startGame({allowAutoSkip: false});

    const nextStepSpy = vi.spyOn(game, "nextStep");

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
    expect(game.turnNumber).toBe(0);
    expect(nextStepSpy).toHaveBeenCalledTimes(9);
    expect(game.currentStepIndex).toBe(StepIndex.SecondMain);
});

test("should change turns", () => {
    const playerTwo = game.addPlayer(BASIC_DECK);

    game.startGame({allowAutoSkip: false});

    const nextStepSpy = vi.spyOn(game, "nextStep");

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    expect(game.currentTurnPlayerID).toBe(1);
    expect(game.currentTurnPlayer()).toBe(playerTwo);
    expect(nextStepSpy).toHaveBeenCalledTimes(11);
    expect(game.currentStepIndex).toBe(StepIndex.Untap);
    expect(game.turnNumber).toBe(1);
});

test.each([false, true])("only the starting player's first draw step is skipped with auto-skip %s", allowAutoSkip => {
    const opponent = game.addPlayer(BASIC_DECK);
    game.startGame({allowAutoSkip});

    if (!allowAutoSkip) {
        gameEventManager.addEvent(new GameEvent_GoToNextStep());
        expect(game.currentStepIndex).toBe(StepIndex.Upkeep);
        gameEventManager.addEvent(new GameEvent_GoToNextStep());
    }
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(player.hand.cards).toHaveLength(7);
    expect(opponent.hand.cards).toHaveLength(7);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    if (!allowAutoSkip)
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(opponent.hand.cards).toHaveLength(8);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    if (!allowAutoSkip)
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    expect(game.currentTurnPlayer()).toBe(player);
    expect(player.hand.cards).toHaveLength(8);
});

test("turn and phase controls wait for a pending target choice", () => {
    game.addPlayer(BASIC_DECK);
    game.startGame({allowAutoSkip: true});
    playerActionManager.startTargeting(player.hand.cards[0], [TargetTypeKeys.Player], 1, () => true, vi.fn());

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    gameEventManager.addEvent(new GameEvent_GoToNextPhase());
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
    game.checkAutoSkip();
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.turnNumber).toBe(0);

    game.pendingTargeter.onCancelled();
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    expect(game.turnNumber).toBe(1);
});

test("should autoskip steps with no player actions", () => {
    const nextStepSpy = vi.spyOn(game, "nextStep");

    game.startGame({ allowAutoSkip: true });

    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(nextStepSpy).toHaveBeenCalledTimes(3);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(game.currentStepIndex).toBe(StepIndex.SecondMain);
    expect(nextStepSpy).toHaveBeenCalledTimes(9);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(nextStepSpy).toHaveBeenCalledTimes(15);
    expect(game.turnNumber).toBe(1);
});

test("auto-skip finishes the next player's draw before entering their main phase", () => {
    const opponent = game.addPlayer([FOREST]);
    game.startGame({allowAutoSkip: true});
    const forest = opponent.hand.cards[0];
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, opponent.library));
    const onStepStart = (event: GameEvent_StepStart) => {
        if (event.player === opponent && event.stepIndex === StepIndex.Main)
            expect(forest.zone).toBe(opponent.hand);
    };

    gameEventManager.onPerformed(GameEventType.StepStart, onStepStart);
    try {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, onStepStart);
    }

    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(playerActionManager.cardActionsForUI.has(forest)).toBe(true);
});

test("auto-skip sees lands untap before checking the next player's spells", () => {
    const opponent = game.addPlayer([MONS_GOBLIN_RAIDERS]);
    game.startGame({allowAutoSkip: true});
    const goblin = opponent.hand.cards[0];
    const mountain = new Card(cardData[MOUNTAIN], opponent);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, opponent.battlefield));
    mountain.tapped = true;
    const onStepStart = (event: GameEvent_StepStart) => {
        if (event.player === opponent && event.stepIndex === StepIndex.Main)
            expect(mountain.tapped).toBe(false);
    };

    gameEventManager.onPerformed(GameEventType.StepStart, onStepStart);
    try {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, onStepStart);
    }

    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(playerActionManager.cardActionsForUI.has(goblin)).toBe(true);
});

test("auto-skip pauses at each main phase when no one can act", () => {
    player.library.cards.length = 0;
    const opponent = game.addPlayer([]);
    game.startGame({allowAutoSkip: true});
    expect(game.currentTurnPlayer()).toBe(player);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.turnNumber).toBe(0);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.turnNumber).toBe(1);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    expect(game.currentTurnPlayer()).toBe(player);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.turnNumber).toBe(2);
});

test.each([StepIndex.Upkeep, StepIndex.Main, StepIndex.Cleanup])("both mana pools empty after step %s", step => {
    const opponent = game.addPlayer(BASIC_DECK);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(step));
    player.manaPool[ManaColour.G] = 2;
    opponent.manaPool[ManaColour.U] = 1;

    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
    expect(opponent.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
});

test.each([
    ["Next step", GameEvent_GoToNextStep],
    ["Skip to Beginning", GameEvent_GoToNextPhase],
    ["End turn", GameEvent_GoToNextTurn],
])("cleanup clears damage on both battlefields via %s", (_label, Advance) => {
    const opponent = game.addPlayer(BASIC_DECK);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_DrawCard(player));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
    const bears = game.players.map(owner => {
        const card = new Card(cardData[GRIZZLY_BEARS], owner);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, owner.battlefield));
        card.damageTaken = 1;
        return card;
    });
    const hand = [...player.hand.cards];
    expect(hand.length).toBeGreaterThan(7);

    gameEventManager.addEvent(new Advance());

    expect(bears.map(card => card.damageTaken)).toEqual([0, 0]);
    expect(bears.map(card => card.zone)).toEqual([player.battlefield, opponent.battlefield]);
    expect(player.hand.cards).toEqual(hand);
});
