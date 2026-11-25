import { addTestCard,startMainPhase } from "@engine/tests/testData";
import { GameEvent_ActivateAbility } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
    startMainPhase();
});

test.each([
    ["Plains", ManaColour.W],
    ["Island", ManaColour.U],
    ["Swamp", ManaColour.B],
    ["Mountain", ManaColour.R],
    ["Forest", ManaColour.G],
])("%s taps for one mana of its colour", (name, colour) => {
    const land = addTestCard(cardData.find(card => card.name === name), player, player.battlefield);

    gameEventManager.addEvent(new GameEvent_ActivateAbility(player, land, land.abilities[0]));

    const expectedMana = [0, 0, 0, 0, 0, 0];
    expectedMana[colour] = 1;
    expect(land.tapped).toBe(true);
    expect(player.manaPool).toEqual(expectedMana);
});
