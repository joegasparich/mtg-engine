import {cardData} from "../../../index";
import Player from "../../Player";
import Game, {game} from "../../Game";
import Card from "../../Card";
import gameEventManager from "../../events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_ChangeCardZone} from "../../events";
import ActivatedAbility from "../../ActivatedAbility";
import {ManaColour} from "../../mana";

const FOREST = cardData.findIndex(c => c.name == "Forest");
const GRIZZLY_BEARS = cardData.findIndex(c => c.name == "Grizzly Bears");

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("land should tap for mana", () => {
    const forest = new Card(cardData[FOREST], player);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(forest, player.battlefield));

    const tapForest = new ActivatedAbility(player, forest.activatedAbilities[0], forest);

    const abilityEnteredStack = vi.spyOn(game.stack, "abilityActivated");

    // Check ability created properly
    expect(tapForest.def).toBe(forest.activatedAbilities[0]);
    expect(tapForest.card).toBe(forest);

    gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForest));

    // Check stack resolved properly
    expect(abilityEnteredStack).toHaveBeenCalledTimes(1);

    // Check mana added
    expect(player.manaPool[ManaColour.G]).toBe(1);
});