import {cardData} from "../../../index";
import Player from "../../Player";
import Game, {game} from "../../Game";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_ChangeCardZone} from "../../events";
import {ManaColour} from "../../mana";
import {FOREST} from "../testData";
import {PlayerActions} from "../../actions";

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

    (new PlayerActions.ActivateAbility(forest.activatedAbilities[0], forest)).perform(player);

    // Check stack resolved properly
    expect(abilityEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana added
    expect(player.manaPool[ManaColour.G]).toBe(1);
});