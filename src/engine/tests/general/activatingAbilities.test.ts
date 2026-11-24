import { PlayerActions } from "@engine/actions";
import { GameEvent_ActivateAbility,GameEvent_GoToStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,FOREST,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("a mana ability taps its land and resolves without touching the stack", () => {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    game.stack.spellCast(player, bears);

    const abilityEnteredStack = vi.spyOn(game.stack, "abilityActivated");

    new PlayerActions.ActivateAbility(forest, forest.abilities[0]).perform(player);

    expect(abilityEnteredStack).not.toHaveBeenCalled();
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects).toContainEqual(expect.objectContaining({ card: bears.card }));
    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});

test("two queued activations cannot pay with the same tap", () => {
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const ability = forest.abilities[0];
    gameEventManager.addEvents([
        new GameEvent_ActivateAbility(player, forest, ability),
        new GameEvent_ActivateAbility(player, forest, ability),
    ]);

    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});
