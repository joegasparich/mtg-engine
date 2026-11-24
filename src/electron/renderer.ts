import type { ElectronAPI } from './preload';

import { startGame } from "../engine/root";

declare global {
    interface Window {
        electronAPI: ElectronAPI; // Add the electronAPI property definition
    }
}

function main() {
    startGame().catch(error => {
        console.error("Could not start the game:", error);
        const message = document.createElement("p");
        message.textContent = "The game could not start. See the developer console for details.";
        document.body.appendChild(message);
    });
}

main();
