import * as PIXI from 'pixi.js';

import Game, {game} from "./Game";
import {CardDef} from "../defs";
import UIRoot, {uiRoot} from "../ui/UIRoot";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_CastSpell, GameEvent_ChangeCardZone, GameEvent_GoToNextStep, GameEvent_GoToNextTurn} from "./events";
import Card from "./Card";
import ActivatedAbility from "./ActivatedAbility";
import Player from "./Player";
import {cardData} from "../index";
import {randInt} from "../utility/randomUtility";

declare global {
    interface Window {
        game: Game;
        cards: CardDef[]
    }
}

const FOREST = 4;
const MOUNTAIN = 3;
const BEARS = 5;
const GOBLINS = 6;

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
    const playerOne = game.addPlayer([MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS]);
    const playerTwo = game.addPlayer([MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, MOUNTAIN, GOBLINS, GOBLINS, GOBLINS, GOBLINS, GOBLINS]);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame({allowAutoSkip: true});

    function playBears(player: Player) {
        const forestA = new Card(cardData[FOREST], player);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestA, player.hand));
        gameEventManager.addEvent(new GameEvent_CastSpell(player, forestA));

        const forestB = new Card(cardData[FOREST], player);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestB, player.hand));
        gameEventManager.addEvent(new GameEvent_CastSpell(player, forestB));

        const bears = new Card(cardData[BEARS], player);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

        const tapForestA = new ActivatedAbility(player, forestA.activatedAbilities[0], forestA);
        gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestA));

        const tapForestB = new ActivatedAbility(player, forestB.activatedAbilities[0], forestB);
        gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestB));

        gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));
    }

    // // Test
    // playBears(playerOne);
    // gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    // playBears(playerTwo);
}

function tick(time: PIXI.Ticker) {

}