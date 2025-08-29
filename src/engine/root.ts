import * as PIXI from 'pixi.js';

import Game, {game} from "@engine/Game";
import {CardDef} from "~/defs";
import UIRoot, {uiRoot} from "@ui/UIRoot";
import gameEventManager from "@engine/events/GameEventManager";
import {
    GameEvent_ActivateAbility,
    GameEvent_CastSpell,
    GameEvent_ChangeCardZone,
    GameEvent_GoToNextStep,
    GameEvent_GoToNextTurn,
    GameEvent_GoToStep
} from "@engine/events";
import {cardData} from "~/index";
import Card from "@engine/Card";
import {StepIndex} from "@engine/Step";
import {randInt} from "@utility/randomUtility";

declare global {
    interface Window {
        game: Game;
        cards: CardDef[]
    }
}

const PLAINS = 0;
const ISLAND = 1;
const MOUNTAIN = 3;
const FOREST = 4;
const BEARS = 5;
const GOBLINS = 6;
const ELEMENTAL = 7;
const RECALL = 8;

export async function startGame() {
    Game.init();
    UIRoot.init();

    window.game = game;
    window.cards = cardData;

    window.addEventListener("keyup", (e) => {
        if (e.key == " ")
            gameEventManager.addEvent(new GameEvent_GoToNextStep());
    });

    const playerOne = game.addPlayer(Array.from({ length: 60 }).map(() => randInt(0, cardData.length)));
    const playerTwo = game.addPlayer(Array.from({ length: 60 }).map(() => randInt(0, cardData.length)));
    // const playerOne = game.addPlayer([ISLAND, ISLAND, ISLAND, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, GOBLINS, ELEMENTAL, ELEMENTAL, ELEMENTAL, ELEMENTAL, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS]);
    // const playerTwo = game.addPlayer([ISLAND, ISLAND, ISLAND, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, GOBLINS, ELEMENTAL, ELEMENTAL, ELEMENTAL, ELEMENTAL, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS]);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame({allowAutoSkip: true});

    // Combat Test
    const island = new Card(cardData[ISLAND], playerOne);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(island, playerOne.hand));
    gameEventManager.addEvent(new GameEvent_CastSpell(playerOne, island));

    const elemental = new Card(cardData[ELEMENTAL], playerOne);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(elemental, playerOne.hand));

    gameEventManager.addEvent(new GameEvent_ActivateAbility(playerOne, island, island.abilities[0]));

    gameEventManager.addEvent(new GameEvent_CastSpell(playerOne, elemental));

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());

    const mountain = new Card(cardData[MOUNTAIN], playerTwo);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, playerTwo.hand));
    gameEventManager.addEvent(new GameEvent_CastSpell(playerTwo, mountain));

    const goblin = new Card(cardData[GOBLINS], playerTwo);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblin, playerTwo.hand));

    gameEventManager.addEvent(new GameEvent_ActivateAbility(playerTwo, mountain, mountain.abilities[0]));

    gameEventManager.addEvent(new GameEvent_CastSpell(playerTwo, goblin));

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
}

function tick(time: PIXI.Ticker) {

}