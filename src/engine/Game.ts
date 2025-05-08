import * as PIXI from "pixi.js";

import Player from "./Player";
import {Stack} from "./Zone";
import {Step, StepIndex} from "./Step";
import gameEventManager, {GameEvent_Simple, GameEventType} from "./events/GameEventManager";
import {GameEvent_StepEnd, GameEvent_StepStart} from "./events";
import {GameEvent_DrawCard} from "./events/GameEvent_DrawCard";

export default class Game {
    players: Player[] = [];
    stack = new Stack();

    currentTurnPlayerID = 0;
    turnNumber = 0;
    currentStepIndex = 0;

    addPlayer(deck: number[]): Player {
        const id = this.players.length;
        const player = new Player(id, deck);
        this.players.push(player);

        return player;
    }
    currentPlayer(): Player {
        return this.players[this.currentTurnPlayerID];
    }

    startGame() {
        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Game started"));

        // Shuffle libraries
        for (let player of this.players) {
            player.library.shuffle();
        }

        // Draw 7
        for (let i = 0; i < 7; i++) {
            for (let player of this.players) {
                gameEventManager.addEvent(new GameEvent_DrawCard(player));
            }
        }

        this.currentTurnPlayerID = 0;
        this.turnNumber = 0;
        this.currentStepIndex = 0;
        this.startStep(this.currentStepIndex);
    }
    nextTurn() {
        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Next turn"));

        this.currentTurnPlayerID = (this.currentTurnPlayerID + 1) % this.players.length;
        this.turnNumber++;
        this.currentStepIndex = 0;
        this.startStep(this.currentStepIndex);
    }
    nextStep() {
        this.endStep(this.currentStepIndex)
        this.currentStepIndex++;

        if (this.currentStepIndex == StepIndex.End)
            this.nextTurn();
        else {
            this.startStep(this.currentStepIndex)
        }
    }

    private startStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepStart(this.currentPlayer(), index));
        Step.all[index].onStart(this.currentPlayer());
    }
    private endStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepEnd(this.currentPlayer(), index));
        Step.all[index].onEnd(this.currentPlayer());
    }
}