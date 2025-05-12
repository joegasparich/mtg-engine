import type {ElectronAPI} from './preload';

import {startGame} from "../engine/root";

declare global {
    interface Window {
        electronAPI: ElectronAPI; // Add the electronAPI property definition
    }
}

function main() {
    startGame();
}

main();
