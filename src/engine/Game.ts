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
    activePlayerID = -1;
    turnNumber = 0;
    currentStepIndex = 0;

    addPlayer(deck: number[]): Player {
        const id = this.players.length;
        const player = new Player(id, deck);
        this.players.push(player);

        return player;
    }
    currentTurnPlayer(): Player {
        return this.players[this.currentTurnPlayerID];
    }
    activePlayer(): Player | null {
        if (this.activePlayerID < 0)
            return null;

        return this.players[this.activePlayerID];
    }
    randomOpponent(player: Player): Player {
        return this.players[(player.id + 1) % 2]; // TODO: Randomize
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
        this.activePlayerID = -1;
        this.turnNumber = 0;
        this.currentStepIndex = 0;

        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));

        this.startStep(this.currentStepIndex);

        this.checkAutoSkip()
    }
    nextTurn() {
        this.currentTurnPlayerID = (this.currentTurnPlayerID + 1) % this.players.length;
        this.turnNumber++;
        this.currentStepIndex = 0;

        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));

        this.startStep(this.currentStepIndex);

        this.checkAutoSkip()
    }
    nextStep() {
        this.endStep(this.currentStepIndex)
        this.currentStepIndex++;

        if (this.currentStepIndex > StepIndex.End)
            this.nextTurn();
        else {
            this.startStep(this.currentStepIndex)
        }

        this.checkAutoSkip()
    }
    skipToNextTurn() {
        do {
            this.nextStep();
        } while (this.currentStepIndex != 0)
    }
    skipToNextPhase() {
        const nextPhaseIndex = (Step.phaseIndex(this.currentStepIndex) + 1) % Step.NUM_PHASES;
        const nextPhaseStep = Step.phaseStart(nextPhaseIndex)
        do {
            this.nextStep()
        } while (this.currentStepIndex != nextPhaseStep)
    }
    checkAutoSkip() {
        // Automatically advance step if there are no actions
        if (this.activePlayer() != null && this.activePlayer()?.getActions(true).length > 0)
            return;

        // TODO: We don't care about mana abilities unless there is something to pay for

        this.nextStep()
    }

    private startStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepStart(this.currentTurnPlayer(), index));
        Step.all[index].onStart(this.currentTurnPlayer());
    }
    private endStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepEnd(this.currentTurnPlayer(), index));
        Step.all[index].onEnd(this.currentTurnPlayer());
    }
}