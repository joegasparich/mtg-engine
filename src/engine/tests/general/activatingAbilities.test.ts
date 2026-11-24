import { PlayerActions } from "@engine/actions";
import Card from "@engine/Card";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { FOREST } from "@engine/tests/testData";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("land should tap for mana", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    const abilityEnteredStack = vi.spyOn(game.stack, "abilityActivated");

    (new PlayerActions.ActivateAbility(forest, forest.abilities[0])).perform(player);

    // Check stack resolved properly
    expect(abilityEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana added
    expect(player.manaPool[ManaColour.G]).toBe(1);
});