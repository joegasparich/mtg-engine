import { PlayerActions } from "@engine/actions";
import playerActionManager,{ TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_PlayLand } from "@engine/events";
import gameEventManager,{ GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,FOREST,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { type CardDef,CardType } from "~/defs";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

function addForestToHand(owner: Player) {
    const forest = addTestCard(cardData[FOREST], owner, owner.hand);
    return forest;
}

test("shows each mode, rejects unavailable choices, and can cancel before choosing targets", () => {
    const other = game.addPlayer([]);
    startMainPhase();
    const targetCreature = { parts: { AbilityPart_Target: {
        saveAs: "CREATURE", validTargets: [TargetTypeKeys.Card],
        targetValidator: { cardType: CardType.Creature, onBattlefield: true },
    } } };
    const targetPlayer = { parts: { AbilityPart_Target: { saveAs: "PLAYER", validTargets: [TargetTypeKeys.Player] } } };
    const def: CardDef = {
        ...cardData[GRIZZLY_BEARS], type: CardType.Instant, cost: "{G}", abilities: [],
        spellModes: [{ text: "Choose a creature", abilities: [targetCreature] },
            { text: "Choose a player", abilities: [targetPlayer] }],
    };
    const card = addTestCard(def, player, player.hand);
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const action = new PlayerActions.PlayCard(card);
    action.perform(player);

    const first = game.pendingSpellModeChoice;
    expect(first.options).toEqual([{ text: "Choose a creature", enabled: false }, { text: "Choose a player", enabled: true }]);
    first.submit(other, 1);
    for (const invalid of [0, -1, 2, NaN, 0.5])
        first.submit(player, invalid);
    expect(game.pendingSpellModeChoice).toBe(first);
    expect(game.pendingTargeter).toBeNull();
    first.submit(player, null);
    expect(game.pendingSpellModeChoice).toBeNull();
    expect(game.priorityPlayer).toBe(player);

    action.perform(player);
    const second = game.pendingSpellModeChoice;
    first.submit(player, 1);
    expect(game.pendingSpellModeChoice).toBe(second);
    second.submit(player, 1);
    expect(game.pendingTargeter.validateTargets([other])).toBe(true);
    game.pendingTargeter.onCancelled();

    expect(card.zone).toBe(player.hand);
    expect(forest.tapped).toBe(false);
    expect(game.stack.objects).toEqual([]);
    expect(playerActionManager.getCardActions(card, player)).toHaveLength(1);
});

test("announces the mode before X and preserves each spell's mode until it resolves", () => {
    const other = game.addPlayer([]);
    startMainPhase();
    const def: CardDef = {
        ...cardData[GRIZZLY_BEARS], type: CardType.Instant, cost: "{X}{G}", abilities: [],
        spellModes: [
            { text: "Gain life", abilities: [{ parts: {
                AbilityPart_Effect_GainLife: { inSignal: "SPELL_RESOLVE", target: "THIS.controller", amount: 1 },
            } }] },
            { text: "Target player gains life", abilities: [{ parts: {
                AbilityPart_Target: { saveAs: "PLAYER", validTargets: [TargetTypeKeys.Player] },
                AbilityPart_Effect_GainLife: { inSignal: "SPELL_RESOLVE", target: "PLAYER", amount: 2 },
            } }] },
        ],
    };
    const first = addTestCard(def, player, player.hand);
    const second = addTestCard(def, player, player.hand);
    player.manaPool[ManaColour.G] = 3;
    expect(game.stack.spellCast(player, first)).toBe(false);
    expect(game.stack.spellCast(player, first, [other], 0, 0)).toBe(false);
    expect(game.stack.spellCast(player, first, [], 0, 1)).toBe(false);
    expect(game.stack.spellCast(player, first, [], 0, 2)).toBe(false);

    new PlayerActions.PlayCard(first).perform(player);
    expect(game.pendingSpellXChoice).toBeNull();
    game.pendingSpellModeChoice.submit(player, 1);
    expect(game.pendingTargeter).toBeNull();
    game.pendingSpellXChoice.submit(player, 1);
    game.pendingTargeter.onTargeted([other]);

    new PlayerActions.PlayCard(second).perform(player);
    game.pendingSpellModeChoice.submit(player, 0);
    game.pendingSpellXChoice.submit(player, 0);
    expect(game.pendingTargeter).toBeNull();
    expect(game.stack.objects).toMatchObject([
        { card: first.card, chosenMode: 1, chosenX: 1, targets: [other] },
        { card: second.card, chosenMode: 0, chosenX: 0, targets: [] },
    ]);

    passPriorityRound();
    expect([player.life, other.life]).toEqual([21, 20]);
    passPriorityRound();
    expect([player.life, other.life]).toEqual([21, 22]);
});

test("announces a safe affordable X, with cancellation before mana is paid", () => {
    const other = game.addPlayer([]);
    startMainPhase();
    const spell = addTestCard({
        ...cardData[GRIZZLY_BEARS], type: CardType.Instant, cost: "{X}{X}{1}{U}", abilities: [],
    }, player, player.hand);
    player.manaPool[ManaColour.R] = 5;
    const action = new PlayerActions.PlayCard(spell);
    action.perform(player);
    expect(game.pendingSpellXChoice).toBeNull();
    expect(playerActionManager.getCardActions(spell, player)).toEqual([]);

    player.manaPool[ManaColour.U] = 1;
    action.perform(player);
    const first = game.pendingSpellXChoice;
    expect(first.max).toBe(2);
    first.submit(other, 2);
    for (const invalid of [-1, 1.5, 3, Infinity, NaN])
        first.submit(player, invalid);
    expect(game.pendingSpellXChoice).toBe(first);

    first.submit(player, null);
    expect(spell.zone).toBe(player.hand);
    expect(game.priorityPlayer).toBe(player);
    expect(game.stack.objects).toEqual([]);
    expect(player.manaPool[ManaColour.U]).toBe(1);
    expect(player.manaPool[ManaColour.R]).toBe(5);

    action.perform(player);
    const second = game.pendingSpellXChoice;
    first.submit(player, 2);
    expect(game.pendingSpellXChoice).toBe(second);
    player.manaPool[ManaColour.R] = 4;
    second.submit(player, 2);
    expect(game.pendingSpellXChoice).toBe(second);
    second.submit(player, 1);
    expect(game.stack.objects.at(-1)).toMatchObject({ card: spell.card, chosenX: 1, cost: [0, 1, 0, 0, 0, 0, 3] });
    expect(player.manaPool[ManaColour.R]).toBe(1);
    expect(player.manaPool[ManaColour.U]).toBe(0);
});

test("cancelling targets after announcing X leaves the spell and mana available", () => {
    const other = game.addPlayer([]);
    startMainPhase();
    const spell = addTestCard({
        ...cardData[GRIZZLY_BEARS], type: CardType.Instant, cost: "{X}{G}",
        abilities: [{ parts: { AbilityPart_Target: { saveAs: "PLAYER", validTargets: [TargetTypeKeys.Player] } } }],
    }, player, player.hand);
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    player.manaPool[ManaColour.R] = 1;
    new PlayerActions.PlayCard(spell).perform(player);
    game.pendingSpellXChoice.submit(player, 1);
    expect(game.pendingTargeter.validateTargets([other])).toBe(true);
    game.pendingTargeter.onCancelled();
    expect(spell.zone).toBe(player.hand);
    expect(player.manaPool[ManaColour.R]).toBe(1);
    expect(forest.tapped).toBe(false);
    expect(game.priorityPlayer).toBe(player);
});

test("target card types accept any listed type and still enforce other target filters", () => {
    const creature = cardData[GRIZZLY_BEARS];
    const target = addTestCard(creature, player, player.battlefield);
    const spell = addTestCard({
        ...creature, type: CardType.Instant, abilities: [{ parts: {
            AbilityPart_Target: {
                saveAs: "TARGET", validTargets: [TargetTypeKeys.Card],
                targetValidator: { cardTypes: [CardType.Creature, CardType.Artifact], onBattlefield: true, tapped: true },
            },
        } }],
    }, player, player.hand);
    const { spellTargeter } = spell;

    expect(spellTargeter.validateTargets([target])).toBe(false);
    target.tapped = true;
    expect(spellTargeter.validateTargets([target])).toBe(true);
    target.type = CardType.Artifact;
    expect(spellTargeter.validateTargets([target])).toBe(true);
    target.type = CardType.Enchantment;
    expect(spellTargeter.validateTargets([target])).toBe(false);
});

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

    expect(onPlay).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ player, handObject: forest }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        oldObject: forest,
        newObject: expect.objectContaining({ card: forest.card }),
        oldZone: player.hand,
        newZone: player.battlefield,
    }));
    expect(player.hand.objects).toHaveLength(0);
    expect(player.battlefield.objects.map(object => object.card)).toEqual([forest.card]);
});

test("the casting event and stack reject lands", () => {
    game.startGame();
    const forest = addForestToHand(player);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

    gameEventManager.addEvent(new GameEvent_CastSpell(player, forest));
    expect(game.stack.spellCast(player, forest)).toBe(false);

    expect(forest.zone).toBe(player.hand);
    expect(game.stack.objects).toHaveLength(0);
    expect(playerActionManager.getCardActions(forest, player)).toHaveLength(1);
});

test("a land play requires an empty stack even if the action was already offered", () => {
    game.startGame();
    const forest = addForestToHand(player);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [play] = playerActionManager.getCardActions(forest, player);

    game.stack.spellCast(player, bears);
    expect(playerActionManager.getCardActions(forest, player)).toHaveLength(0);
    play.perform(player);
    expect(forest.zone).toBe(player.hand);
    expect(game.stack.objects).toContainEqual(expect.objectContaining({ card: bears.card }));

    game.stack.resolveAll();
    play.perform(player);
    expect(player.battlefield.objects.map(object => object.card)).toContain(forest.card);
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

    expect(player.battlefield.objects.map(object => object.card)).toEqual([firstLand.card]);
    expect(player.hand.objects).toEqual([secondLand]);
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
    expect(opponent.battlefield.objects).toHaveLength(0);

    const [opponentPlay] = playerActionManager.getCardActions(opponentLand, opponent);
    opponentPlay.perform(opponent);
    expect(opponent.battlefield.objects.map(object => object.card)).toEqual([opponentLand.card]);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const [nextTurnPlay] = playerActionManager.getCardActions(secondLand, player);
    nextTurnPlay.perform(player);
    expect(player.battlefield.objects.map(object => object.card)).toEqual([firstLand.card, secondLand.card]);
});

test("a spell action from the previous turn cannot spend either player's mana", () => {
    const opponent = game.addPlayer([]);
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    player.manaPool[ManaColour.G] = 2;
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
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
    gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));

    passPriorityRound();
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check card entered battlefield
    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0].card).toBe(bears.card);
});

test("shouldn't play creature card from hand with insufficient mana", () => {
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    // Check stack never resolved
    expect(cardEnteredStack).toHaveBeenCalledTimes(0);

    // Check card remained in hand
    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Check card did not enter battlefield
    expect(player.battlefield.objects.length).toBe(0);
});

test("should play creature card from hand with sufficient mana", () => {
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 2;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    passPriorityRound();
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(0);

    // Check card left hand
    expect(player.hand.objects.length).toBe(0);

    // Check card entered battlefield
    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);
});

test("should play creature card from hand with excess mana", () => {
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 3;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    passPriorityRound();
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(1);

    // Check card left hand
    expect(player.hand.objects.length).toBe(0);

    // Check card entered battlefield
    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);
});

test("should play creature card from hand with generic mana", () => {
    startMainPhase();
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);

    // Add two green mana
    player.manaPool[ManaColour.G] = 1;
    player.manaPool[ManaColour.Colourless] = 1;

    const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");

    (new PlayerActions.PlayCard(bears)).perform(player);

    passPriorityRound();
    expect(cardEnteredStack).toHaveBeenCalledTimes(1);

    // Test mana paid properly
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(player.manaPool[ManaColour.Colourless]).toBe(0);

    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0].def).toBe(cardData[GRIZZLY_BEARS]);
});
