import Player from "../../Player";
import Game, {game} from "../../Game";
import {StepIndex} from "../../Step";
import gameEventManager from "../../events/GameEventManager";
import {BASIC_DECK} from "../testData";
import {GameEvent_GoToNextStep, GameEvent_GoToNextTurn,GameEvent_GoToStep} from "../../events";

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
    expect(nextStepSpy).toHaveBeenCalledTimes(14);
    expect(game.turnNumber).toBe(1);
});
