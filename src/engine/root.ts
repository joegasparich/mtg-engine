import { GameEvent_Advance } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import UIRoot,{ initRenderer, uiRoot } from "@ui/UIRoot";
import { CardDef } from "~/defs";
import { cardData } from "~/index";

declare global {
    interface Window {
        game: Game;
        cards: CardDef[]
    }
}

const playtestDeck = Object.entries({
    Island: 24,
    Twiddle: 8,
    Unsummon: 8,
    "Merfolk of the Pearl Trident": 8,
    "Prodigal Sorcerer": 8,
    "Celestial Prism": 4,
}).flatMap(([name, copies]) => {
    const index = cardData.findIndex(card => card.name === name);
    if (index < 0)
        throw new Error(`Unknown playtest card: ${name}`);
    return Array<number>(copies).fill(index);
});

export async function startGame() {
    await initRenderer();
    Game.init();
    UIRoot.init();

    window.game = game;
    window.cards = cardData;

    window.addEventListener("keyup", (e) => {
        if (e.key === " " && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement))
            gameEventManager.addEvent(new GameEvent_Advance());
    });

    const playerOne = game.addPlayer(playtestDeck);
    const playerTwo = game.addPlayer(playtestDeck);

    uiRoot.onPlayerAdded(playerOne);
    uiRoot.onPlayerAdded(playerTwo);

    game.startGame({allowAutoSkip: true});
}
