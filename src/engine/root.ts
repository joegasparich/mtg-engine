import * as PIXI from 'pixi.js';

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
    "Celestial Prism": 8,
    "Black Lotus": 4,
    Plains: 8,
    Island: 8,
    Forest: 8,
    "Pearled Unicorn": 6,
    "Air Elemental": 6,
    "Ancestral Recall": 6,
    "Grizzly Bears": 6,
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

    // const elemental = new Card(cardData[ELEMENTAL], playerOne);
    // gameEventManager.addEvent(new GameEvent_ChangeCardZone(elemental, playerOne.hand));
    //
    // gameEventManager.addEvent(new GameEvent_ActivateAbility(playerOne, island, island.abilities[0]));
    //
    // gameEventManager.addEvent(new GameEvent_CastSpell(playerOne, elemental));
    //
    // gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    //
    // const mountain = new Card(cardData[MOUNTAIN], playerTwo);
    // gameEventManager.addEvent(new GameEvent_ChangeCardZone(mountain, playerTwo.hand));
    // gameEventManager.addEvent(new GameEvent_CastSpell(playerTwo, mountain));
    //
    // const goblin = new Card(cardData[GOBLINS], playerTwo);
    // gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblin, playerTwo.hand));
    //
    // gameEventManager.addEvent(new GameEvent_ActivateAbility(playerTwo, mountain, mountain.abilities[0]));
    //
    // gameEventManager.addEvent(new GameEvent_CastSpell(playerTwo, goblin));
    //
    // gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    // gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
}

function tick(time: PIXI.Ticker) {

}
