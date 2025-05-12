import Player from "./Player";
import {Stack} from "./Zone";
import {Step, StepIndex} from "./Step";
import gameEventManager, {GameEvent_Simple, GameEventType} from "./events/GameEventManager";
import {GameEvent_DrawCard, GameEvent_StepEnd, GameEvent_StepStart} from "./events";

class GameOptions {
    allowAutoSkip = false;
}

export default class Game {
    options: GameOptions;

    players: Player[] = [];
    stack = new Stack();

    currentTurnPlayerID = 0;
    activePlayerID = -1;
    turnNumber = 0;
    currentStepIndex = 0;

    static init() {
        game = new Game();
    }

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

    startGame(options?: GameOptions) {
        this.options = options ?? new GameOptions();

        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Game started"));

        // Shuffle libraries
        for (const player of this.players) {
            player.library.shuffle();
        }

        // Draw 7
        for (let i = 0; i < 7; i++) {
            for (const player of this.players) {
                gameEventManager.addEvent(new GameEvent_DrawCard(player));
            }
        }

        this.currentTurnPlayerID = 0;
        this.activePlayerID = -1;
        this.turnNumber = 0;
        this.currentStepIndex = 0;

        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));

        this.startStep(this.currentStepIndex);

        if (this.options.allowAutoSkip)
            this.checkAutoSkip();
    }
    nextStep(doAutoSkip: boolean) {
        this.endStep(this.currentStepIndex);
        this.currentStepIndex++;

        if (this.currentStepIndex > StepIndex.End)
        {
            this.currentTurnPlayerID = (this.currentTurnPlayerID + 1) % this.players.length;
            this.turnNumber++;
            this.currentStepIndex = 0;

            gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));
        }

        this.startStep(this.currentStepIndex);

        if (doAutoSkip)
            this.checkAutoSkip();
    }
    skipToNextTurn() {
        do {
            this.nextStep(false);
        } while (this.currentStepIndex != 0);

        if (game.options.allowAutoSkip)
            this.checkAutoSkip();
    }
    skipToNextPhase() {
        const nextPhaseIndex = (Step.phaseIndex(this.currentStepIndex) + 1) % Step.NUM_PHASES;
        const nextPhaseStep = Step.phaseStart(nextPhaseIndex);
        do {
            this.nextStep(false);
        } while (this.currentStepIndex != nextPhaseStep);
    }
    checkAutoSkip() {
        // Automatically advance step if there are no actions
        if (Step.all[this.currentStepIndex].canAutoSkip(this.currentTurnPlayer()))
            this.nextStep(true);
    }

    private startStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepStart(this.currentTurnPlayer(), index));
        Step.all[index].onStart(this.currentTurnPlayer());
    }
    private endStep(index: StepIndex) {
        gameEventManager.addEvent(new GameEvent_StepEnd(this.currentTurnPlayer(), index));
        Step.all[index].onEnd(this.currentTurnPlayer());
    }

    currentStep() {
        return Step.all[this.currentStepIndex];
    }

    checkState() {
        for (const player of this.players) {
            player.checkState();
        }
    }
}

export let game: Game;
