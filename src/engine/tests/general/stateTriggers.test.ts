import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type Player from "@engine/Player";
import { addTestCard,BASIC_DECK,chooseEarliestTimestamps,FOREST,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
import { cardData } from "~/index";

const watcher = { ...cardData[GRIZZLY_BEARS], abilities: [{ parts: {
    AbilityPart_SelectObjectsContinuously: { zone: ZoneKind.Battlefield, controlledBy: "THIS.controller",
        targetValidator: { cardType: CardType.Land }, saveAs: "LANDS" },
    AbilityPart_Trigger_NoPermanents: { permanentsFrom: "LANDS" },
    AbilityPart_Effect_GainLife: { target: "CONTROLLER", amount: 1 },
} }] };
let player: Player;

beforeEach(() => {
    Game.init();
    player = game.addPlayer(BASIC_DECK);
    game.addPlayer(BASIC_DECK);
    startMainPhase();
});

test("a persistent state triggers once per stack occurrence, including after removal without resolution", () => {
    addTestCard(watcher, player, player.battlefield);
    const [first] = game.stack.objects;
    game.checkState();
    expect(game.stack.objects).toEqual([first]);
    passPriorityRound();
    expect(player.life).toBe(21);
    expect(game.stack.objects).toHaveLength(1);
    const [second] = game.stack.objects;
    expect(second).not.toBe(first);
    game.stack.onLeave(second);
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects[0]).not.toBe(second);
    addTestCard(cardData[FOREST], player, player.battlefield);
    passPriorityRound();
    expect(player.life).toBe(22);
    expect(game.stack.objects).toHaveLength(0);
});

test.each([true, false])("only distinct changes expose the intermediate empty selection (simultaneous %s)", simultaneous => {
    const oldLand = addTestCard(cardData[FOREST], player, player.battlefield);
    const newLand = addTestCard(cardData[FOREST], player, player.hand);
    addTestCard(watcher, player, player.battlefield);
    const moves = [new GameEvent_ChangeCardZone(oldLand, player.hand), new GameEvent_ChangeCardZone(newLand, player.battlefield)];
    if (simultaneous) {
        gameEventManager.performSimultaneous(moves);
        chooseEarliestTimestamps(player, oldLand);
    } else {
        gameEventManager.addEvents(moves);
    }
    expect(game.stack.objects).toHaveLength(simultaneous ? 0 : 1);
});

test("losing control of the last matching permanent triggers even though it stays on the battlefield", () => {
    const land = addTestCard(cardData[FOREST], player, player.battlefield);
    addTestCard(watcher, player, player.battlefield);
    expect(game.stack.objects).toHaveLength(0);

    land.controller = game.players[1];
    game.checkState();
    expect(game.stack.objects).toHaveLength(1);
    land.controller = player;
    passPriorityRound();
    expect(player.life).toBe(21);
    expect(game.stack.objects).toHaveLength(0);
});
