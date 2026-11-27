import playerActionManager,{ TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { GameEvent_Advance,GameEvent_ChangeCardZone,GameEvent_DrawCard,GameEvent_GoToNextPhase,GameEvent_GoToNextStep,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_StepStart } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { StackAbility } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,BASIC_DECK,FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,MOUNTAIN,passPriorityRound,startMainPhase } from "@engine/tests/testData";
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

test("advancing to first strike damage stops at regular damage when first strike is skipped", () => {
    game.startGame();

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.FirstStrikeDamage));

    expect(game.turnNumber).toBe(0);
    expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
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

test("a step-start trigger can pass the turn player to its effect", () => {
    const controller = game.addPlayer(BASIC_DECK);
    startMainPhase();
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_Trigger_StepStart: { step: StepIndex[StepIndex.End], savePlayerAs: "STEP_PLAYER" },
            AbilityPart_Effect_GainLife: { target: "STEP_PLAYER", amount: 1 },
        } }],
    }, controller, controller.battlefield);

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
    expect(game.stack.objects).toHaveLength(1);
    const [trigger] = game.stack.objects;
    expect(trigger).toBeInstanceOf(StackAbility);
    expect(trigger).toMatchObject({ source, controller });
    expect(game.priorityPlayer).toBe(player);
    expect(player.life).toBe(20);

    passPriorityRound();
    expect(player.life).toBe(21);
    expect(controller.life).toBe(20);
});

test("a step-start trigger can filter by a configured player", () => {
    const owner = game.addPlayer(BASIC_DECK);
    startMainPhase();
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_Trigger_StepStart: { step: StepIndex[StepIndex.End], player: "THIS.owner" },
            AbilityPart_Effect_GainLife: { target: "CONTROLLER", amount: 1 },
        } }],
    }, owner, player.battlefield);
    source.controller = player;

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
    expect(game.stack.objects).toHaveLength(0);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects[0]).toMatchObject({ source, controller: player });
    passPriorityRound();
    expect(player.life).toBe(21);
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
    expect(player.hand.objects).toHaveLength(7);
    expect(opponent.hand.objects).toHaveLength(7);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    if (!allowAutoSkip)
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(opponent.hand.objects).toHaveLength(8);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    if (!allowAutoSkip)
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    expect(game.currentTurnPlayer()).toBe(player);
    expect(player.hand.objects).toHaveLength(8);
});

test("turn and phase controls wait for a pending target choice", () => {
    game.addPlayer(BASIC_DECK);
    game.startGame({allowAutoSkip: true});
    playerActionManager.startTargeting(player.hand.objects[0], [TargetTypeKeys.Player], 1, () => true, vi.fn());

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    gameEventManager.addEvent(new GameEvent_GoToNextPhase());
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
    game.checkState();
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.turnNumber).toBe(0);

    game.pendingTargeter.onCancelled();
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    expect(game.turnNumber).toBe(1);
});

test("auto-skip stops for land plays in both main phases", () => {
    game.startGame({allowAutoSkip: true});
    expect(game.currentStepIndex).toBe(StepIndex.Main);

    gameEventManager.addEvent(new GameEvent_Advance());
    expect(game.currentStepIndex).toBe(StepIndex.SecondMain);

    gameEventManager.addEvent(new GameEvent_Advance());
    expect(game.currentStepIndex).toBe(StepIndex.End);
    expect(game.turnNumber).toBe(0);
});

test("auto-skip finishes the next player's draw before entering their main phase", () => {
    const opponent = game.addPlayer([FOREST]);
    game.startGame({allowAutoSkip: true});
    const forest = opponent.hand.objects[0];
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, opponent.library));
    const onStepStart = (event: GameEvent_StepStart) => {
        if (event.player === opponent && event.stepIndex === StepIndex.Main)
            expect(opponent.hand.objects.map(object => object.card)).toContain(forest.card);
    };

    gameEventManager.onPerformed(GameEventType.StepStart, onStepStart);
    try {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, onStepStart);
    }

    expect(game.currentTurnPlayer()).toBe(opponent);
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    const handObject = opponent.hand.objects.find(object => object.card === forest.card);
    expect(playerActionManager.cardActionsForUI.has(handObject)).toBe(true);
});

test("auto-skip sees lands untap before checking the next player's spells", () => {
    const opponent = game.addPlayer([MONS_GOBLIN_RAIDERS]);
    game.startGame({allowAutoSkip: true});
    const goblin = opponent.hand.objects[0];
    const mountain = addTestCard(cardData[MOUNTAIN], opponent, opponent.battlefield);
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

test.each([false, true])("empty turns pause in both main phases and at end of turn with dev auto-pass %s", autoPassPriority => {
    player.library.objects.length = 0;
    const opponent = game.addPlayer([]);
    const steps: StepIndex[] = [];
    const recordStep = (event: GameEvent_StepStart) => steps.push(event.stepIndex);
    gameEventManager.onPerformed(GameEventType.StepStart, recordStep);
    try {
        game.autoPassPriority = autoPassPriority;
        game.startGame({allowAutoSkip: true});
        expect(game.currentTurnPlayer()).toBe(player);
        expect(game.currentStepIndex).toBe(StepIndex.Main);
        expect(game.priorityPlayer).toBe(player);
        expect(playerActionManager.playerHasActions(player, true)).toBe(false);

        gameEventManager.addEvent(new GameEvent_Advance(player));
        expect(game.currentStepIndex).toBe(StepIndex.SecondMain);
        expect(game.priorityPlayer).toBe(player);
        expect(playerActionManager.playerHasActions(player, true)).toBe(false);

        gameEventManager.addEvent(new GameEvent_Advance(player));
        expect(game.currentStepIndex).toBe(StepIndex.End);
        expect(game.turnNumber).toBe(0);
        expect(steps).not.toContain(StepIndex.DeclareBlockers);
        expect(steps).not.toContain(StepIndex.CombatDamage);

        gameEventManager.addEvent(new GameEvent_Advance(player));
        expect(game.currentTurnPlayer()).toBe(opponent);
        expect(game.currentStepIndex).toBe(StepIndex.Main);
        expect(game.priorityPlayer).toBe(opponent);
        expect(game.turnNumber).toBe(1);
        expect(steps).toContain(StepIndex.Cleanup);
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, recordStep);
    }
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
        const permanent = addTestCard(cardData[GRIZZLY_BEARS], owner, owner.battlefield);
        permanent.damageTaken = 1;
        return permanent;
    });
    const hand = [...player.hand.objects];
    expect(hand.length).toBeGreaterThan(7);

    gameEventManager.addEvent(new Advance());

    expect(bears.map(permanent => permanent.damageTaken)).toEqual([0, 0]);
    expect(bears.map(permanent => permanent.zone)).toEqual([player.battlefield, opponent.battlefield]);
    expect(player.hand.objects).toEqual(hand);
});

test("cleanup callbacks run once after damage clears and before the step start event", () => {
    game.startGame();
    const bear = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    bear.damageTaken = 1;
    const cleanup = vi.fn(() => expect(bear.damageTaken).toBe(0));
    gameEventManager.onGamePerformed(GameEventType.Cleanup, cleanup, { once: true });

    const onStepStart = (event: GameEvent_StepStart) => {
        if (event.stepIndex === StepIndex.Cleanup)
            expect(cleanup).toHaveBeenCalledTimes(1);
    };
    gameEventManager.onPerformed(GameEventType.StepStart, onStepStart);
    try {
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(game.turnNumber).toBe(1);
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, onStepStart);
    }
});
