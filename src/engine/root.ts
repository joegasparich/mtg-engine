import * as PIXI from 'pixi.js';

import cardJSON from "../../cards.json";
import Game from "./Game";
import {CardDef} from "../defs";
import UIRoot from "../ui/UIRoot";
import gameEventManager, {GameEvent, GameEvent_GoToNextStep, GameEvent_GoToNextTurn} from "./events/GameEventManager";
import {GameEvent_ActivateAbility, GameEvent_CastSpell, GameEvent_ChangeCardZone} from "./events";
import Card from "./Card";
import ActivatedAbility from "./ActivatedAbility";
import Player from "./Player";

declare global {
    interface Window {
        game: Game;
        cards: CardDef[]
    }
}

export let game: Game = null;
export let uiRoot = new UIRoot();
export const cardData = cardJSON as CardDef[];

const playerOneDeck = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
const playerTwoDeck = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];

const FOREST = 0;
const BEARS = 1;

export async function startGame() {
    game = new Game();

    window.game = game;
    window.cards = cardData;

    window.addEventListener("keyup", (e) => {
        if (e.key == " ")
            gameEventManager.addEvent(new GameEvent_GoToNextStep(true));
    })

    const playerOne = game.addPlayer(playerOneDeck);
    const playerTwo = game.addPlayer(playerTwoDeck);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame();

    function playBears(player: Player) {
        const forestA = new Card(cardData[FOREST], player)
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestA, player.hand));
        gameEventManager.addEvent(new GameEvent_CastSpell(player, forestA));

        const forestB = new Card(cardData[FOREST], player)
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(forestB, player.hand));
        gameEventManager.addEvent(new GameEvent_CastSpell(player, forestB));

        const bears = new Card(cardData[BEARS], player)
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, player.hand));

        const tapForestA = new ActivatedAbility(player, forestA.activatedAbilities[0], forestA)
        gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestA));

        const tapForestB = new ActivatedAbility(player, forestB.activatedAbilities[0], forestB)
        gameEventManager.addEvent(new GameEvent_ActivateAbility(tapForestB));

        gameEventManager.addEvent(new GameEvent_CastSpell(player, bears));

        gameEventManager.addEvent(new GameEvent_CastSpell(player, forestB));
    }

    // Test
    playBears(playerOne);
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    playBears(playerTwo);
}

function tick(time: PIXI.Ticker) {

}