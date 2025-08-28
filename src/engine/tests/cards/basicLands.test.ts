import Player from "@engine/Player";
import {cardData} from "~/index";
import Game, {game} from "@engine/Game";
import Card from "@engine/Card";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_ChangeCardZone} from "@engine/events";
import {ManaColour} from "@engine/mana";

const FOREST = cardData.findIndex(c => c.name == "Forest");

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("forest should tap for green mana", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    gameEventManager.addEvent(new GameEvent_ActivateAbility(player, forest, forest.abilities[0]));

    // Check mana added
    expect(player.manaPool[ManaColour.G]).toBe(1);
});