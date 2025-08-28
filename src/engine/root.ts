import * as PIXI from 'pixi.js';

import Game, {game} from "./Game";
import {CardDef} from "../defs";
import UIRoot, {uiRoot} from "../ui/UIRoot";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_CastSpell, GameEvent_ChangeCardZone, GameEvent_GoToNextStep, GameEvent_GoToNextTurn} from "./events";
import Card from "./Card";
import Player from "./Player";
import {cardData} from "../index";
import {randInt} from "../utility/randomUtility";

declare global {
    interface Window {
        game: Game;
        cards: CardDef[]
    }
}

const ISLAND = 1;
const MOUNTAIN = 3;
const FOREST = 4;
const BEARS = 5;
const GOBLINS = 6;
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

    // const playerOne = game.addPlayer(Array.from({ length: 60 }).map(() => randInt(0, cardData.length)));
    // const playerTwo = game.addPlayer(Array.from({ length: 60 }).map(() => randInt(0, cardData.length)));
    const playerOne = game.addPlayer([ISLAND, ISLAND, ISLAND, ISLAND, ISLAND, RECALL, RECALL, RECALL, RECALL, RECALL, ISLAND, ISLAND, ISLAND, ISLAND, ISLAND, RECALL, RECALL, RECALL, RECALL, RECALL]);
    const playerTwo = game.addPlayer([ISLAND, ISLAND, ISLAND, ISLAND, ISLAND, RECALL, RECALL, RECALL, RECALL, RECALL, ISLAND, ISLAND, ISLAND, ISLAND, ISLAND, RECALL, RECALL, RECALL, RECALL, RECALL]);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame({allowAutoSkip: true});

    // function playBears(player: Player) {
    //     const forestA = new Card(cardData[FOREST], player);
    //     gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestA, player.hand));
    //     gameEventManager.addEvent(new GameEvent_CastSpell(player, forestA));
    //
    //     const forestB = new Card(cardData[FOREST], player);
    //     gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestB, player.hand));
    //     gameEventManager.addEvent(new GameEvent_CastSpell(player, forestB));
    //
    //     const bears = new Card(cardData[BEARS], player);
    //     gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));
    //
    //     const tapForestA = new Ability(player, forestA.activatedAbilities[0], forestA);
    //     gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestA));
    //
    //     const tapForestB = new Ability(player, forestB.activatedAbilities[0], forestB);
    //     gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestB));
    //
    //     gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));
    // }

    // // Test
    // playBears(playerOne);
    // gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    // playBears(playerTwo);
}

function tick(time: PIXI.Ticker) {

}