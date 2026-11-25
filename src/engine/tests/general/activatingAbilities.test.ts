import { PlayerActions } from "@engine/actions";
import { GameEvent_ActivateAbility,GameEvent_GoToStep } from "@engine/events";
import gameEventManager,{ type GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,FOREST,GRIZZLY_BEARS,startMainPhase } from "@engine/tests/testData";
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
    const performed: GameEvent[] = [];
    const observe = (event: GameEvent) => performed.push(event);

    gameEventManager.onPerformed(GameEventType.All, observe);
    try {
        new PlayerActions.ActivateAbility(forest, forest.abilities[0]).perform(player);
    } finally {
        gameEventManager.offPerformed(GameEventType.All, observe);
    }

    expect(performed.map(event => event.type)).toEqual([GameEventType.TapCard, GameEventType.AddMana, GameEventType.ActivateAbility]);
    expect(performed[0].effect).toBeUndefined();
    expect(performed[1].effect?.ability).toBe(forest.abilities[0]);

    expect(abilityEnteredStack).not.toHaveBeenCalled();
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects).toContainEqual(expect.objectContaining({ card: bears.card }));
    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});

test("two queued activations cannot pay with the same tap", () => {
    startMainPhase();
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const ability = forest.abilities[0];
    gameEventManager.addEvents([
        new GameEvent_ActivateAbility(player, forest, ability),
        new GameEvent_ActivateAbility(player, forest, ability),
    ]);

    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});
