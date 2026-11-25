import { PlayerActions } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { GameEvent_Advance,GameEvent_CastSpell,GameEvent_GoToNextStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,FOREST,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { cardData } from "~/index";

beforeEach(() => Game.init());

test("passes priority in turn order and resolves one object at a time in stack order", () => {
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const third = game.addPlayer([]);
    startMainPhase();
    game.infiniteMana = true;
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    const secondBears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    const forest = addTestCard(cardData[FOREST], player, player.hand);
    const opponentBears = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
    const drawn = addTestCard(cardData[FOREST], third, third.library);

    gameEventManager.addEvent(new GameEvent_CastSpell(opponent, recall, [third]));
    expect(recall.zone).toBe(opponent.hand);
    new PlayerActions.PlayCard(bears).perform(player);
    expect(game.priorityPlayer).toBe(player);
    expect(playerActionManager.getCardActions(secondBears, player)).toEqual([]);
    expect(playerActionManager.getCardActions(forest, player)).toEqual([]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.currentStepIndex).toBe(StepIndex.Main);
    expect(game.stack.objects).toMatchObject([{ card: bears.card }]);

    gameEventManager.addEvent(new GameEvent_Advance(third));
    expect(game.priorityPlayer).toBe(player);
    gameEventManager.addEvent(new GameEvent_Advance(player));
    expect(game.priorityPlayer).toBe(opponent);
    expect(playerActionManager.getCardActions(opponentBears, opponent)).toEqual([]);
    new PlayerActions.PlayCard(recall).perform(opponent);
    game.pendingTargeter.onTargeted([third]);
    expect(game.priorityPlayer).toBe(opponent);
    expect(game.stack.objects).toMatchObject([{ card: bears.card }, { card: recall.card }]);

    gameEventManager.addEvent(new GameEvent_Advance(opponent));
    expect(game.priorityPlayer).toBe(third);
    gameEventManager.addEvent(new GameEvent_Advance(third));
    expect(game.priorityPlayer).toBe(player);
    expect(third.hand.objects).toHaveLength(0);
    gameEventManager.addEvent(new GameEvent_Advance(player));
    expect(third.hand.objects.map(object => object.card)).toEqual([drawn.card]);
    expect(game.priorityPlayer).toBe(player);
    expect(game.stack.objects).toMatchObject([{ card: bears.card }]);
    expect(player.battlefield.objects).toHaveLength(0);
    passPriorityRound();
    expect(player.battlefield.objects.map(object => object.card)).toEqual([bears.card]);
    expect(game.stack.objects).toHaveLength(0);
    expect(game.priorityPlayer).toBe(player);
});

test.each([false, true])("auto-skip finds an opponent's playable instant, then dev auto-pass %s", forcePass => {
    game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const island = addTestCard(cardData.find(card => card.name === "Island"), opponent, opponent.battlefield);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
    game.startGame({ allowAutoSkip: true });
    expect(game.currentStepIndex).toBe(StepIndex.Upkeep);
    expect(game.priorityPlayer).toBe(opponent);

    if (forcePass) {
        game.autoPassPriority = true;
        game.checkState();
        expect(recall.zone).toBe(opponent.hand);
        expect(island.tapped).toBe(false);
    } else {
        new PlayerActions.PlayCard(recall).perform(opponent);
        gameEventManager.addEvent(new GameEvent_Advance());
        expect(game.pendingTargeter?.source).toBe(recall);
        game.pendingTargeter.onTargeted([opponent]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([recall.card]);
        expect(island.tapped).toBe(true);
    }

    expect(game.currentStepIndex).toBe(StepIndex.End);
    expect(game.canEndTurn).toBe(true);
    expect(game.turnNumber).toBe(0);
});

test("ending the turn gives the opponent a final chance to respond", () => {
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    game.startGame({ allowAutoSkip: true });
    expect(game.canEndTurn).toBe(true);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
    addTestCard(cardData.find(card => card.name === "Island"), opponent, opponent.battlefield);

    gameEventManager.addEvent(new GameEvent_Advance(player));
    expect(game.currentStepIndex).toBe(StepIndex.End);
    expect(game.priorityPlayer).toBe(opponent);
    expect(game.canEndTurn).toBe(false);
    new PlayerActions.PlayCard(recall).perform(opponent);
    game.pendingTargeter.onTargeted([opponent]);
    expect(opponent.graveyard.objects.map(object => object.card)).toEqual([recall.card]);
    expect(game.turnNumber).toBe(0);
    expect(game.canEndTurn).toBe(true);

    gameEventManager.addEvent(new GameEvent_Advance(player));
    expect(game.turnNumber).toBe(1);
    expect(game.currentTurnPlayer()).toBe(opponent);
});
