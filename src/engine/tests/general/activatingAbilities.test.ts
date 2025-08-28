import {cardData} from "~/index";
import Player from "@engine/Player";
import Game, {game} from "@engine/Game";
import Card from "@engine/Card";
import {FOREST} from "@engine/tests/testData";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ChangeCardZone} from "@engine/events";
import {PlayerActions} from "@engine/actions";
import {ManaColour} from "@engine/mana";

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