import * as PIXI from 'pixi.js';

import cardJSON from "../../cards.json";
import Game from "./Game";
import {CardDef} from "../defs";
import UIRoot from "../ui/UIRoot";

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

export async function startGame() {
    game = new Game();

    window.game = game;
    window.cards = cardData;

    window.addEventListener("keyup", (e) => {
        if (e.key == " ")
            game.nextStep();
    })

    const playerOne = game.addPlayer(playerOneDeck);
    const playerTwo = game.addPlayer(playerTwoDeck);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame();
}

function tick(time: PIXI.Ticker) {

}