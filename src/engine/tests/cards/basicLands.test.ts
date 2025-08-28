import {cardData} from "../../../index";
import Player from "../../Player";
import Game, {game} from "../../Game";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_ChangeCardZone} from "../../events";
import {ManaColour} from "../../mana";

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

    gameEventManager.addEvent(new GameEvent_ActivateAbility(player, forest, forest.activatedAbilities[0]));

    // Check mana added
    expect(player.manaPool[ManaColour.G]).toBe(1);
});