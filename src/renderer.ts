import * as PIXI from 'pixi.js';
import {session} from 'electron';
import type {ElectronAPI} from './preload';

import cardJSON from "./cards.json";
import Game from "./Game";
import {CardDef} from "./CardDef";

declare global {
    interface Window {
        electronAPI: ElectronAPI; // Add the electronAPI property definition
        game: Game;
        cards: CardDef[]
    }
}

export let game: Game = null;
export let pixi: PIXI.Application = null;
export const cardData = cardJSON as CardDef[];

const playerOneDeck = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
const playerTwoDeck = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];

async function main() {
    pixi = new PIXI.Application();
    await pixi.init({ background: '#1099bb', resizeTo: window });
    document.body.appendChild(pixi.canvas);
    pixi.ticker.add(tick);
    pixi.stage.eventMode = 'static';
    pixi.stage.hitArea = pixi.screen;

    game = new Game();

    window.game = game;
    window.cards = cardData;

    window.addEventListener("keyup", (e) => {
        if (e.key == " ")
            game.nextStep();
    })

    const playerOne = game.addPlayer(playerOneDeck, new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2), 0);
    const playerTwo = game.addPlayer(playerTwoDeck, new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2), 180);

    game.startGame();
}

function tick(time: PIXI.Ticker) {

}

export async function loadImageFromExternalUrl(externalUrl: string): Promise<PIXI.Texture | undefined> {
    try {
        const dataUrlFromMain = await window.electronAPI.fetchImage(externalUrl);

        if (!dataUrlFromMain) {
            throw new Error("Main process did not return a Data URL.");
        }

        const dataUrl = dataUrlFromMain.trim();

        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
            throw new Error('Invalid Data URL format after fetching and trimming.');
        }

        const texture = await PIXI.Assets.load<PIXI.Texture>(dataUrl);
        texture.source.autoGenerateMipmaps = true;

        // Validation for PixiJS v8
        if (!texture) {
            throw new Error('Texture is null/undefined after PIXI.Assets.load attempt.');
        }
        if (!(texture instanceof PIXI.Texture)) {
            throw new Error('Loaded asset is not a PIXI.Texture instance.');
        }
        if (texture.width <= 0 || texture.height <= 0) {
            throw new Error(`Texture has invalid dimensions after load: width=${texture.width}, height=${texture.height}`);
        }
        // Ensure source exists before checking its properties
        if (!texture.source || !(texture.source.resource instanceof ImageBitmap)) {
            throw new Error('Texture source or its underlying resource is invalid.');
        }
        // Check if texture or its source has been destroyed
        if (texture.destroyed || (texture.source && texture.source.destroyed)) {
            throw new Error('Texture or its source is marked as destroyed.');
        }

        // If all checks pass, create and return the sprite
        return texture;

    } catch (error) {
        console.error(`loadImageFromExternalUrl failed for ${externalUrl}:`, error instanceof Error ? error.message : error);
        return undefined;
    }
}

main();
