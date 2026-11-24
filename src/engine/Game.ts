import playerActionManager,{ Targeter } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_DrawCard,GameEvent_StepEnd,GameEvent_StepStart } from "@engine/events";
import gameEventManager,{ GameEvent_Log,GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import Player from "@engine/Player";
import { Stack } from "@engine/Stack";
import { Step,StepIndex } from "@engine/Step";

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
    landPlayedThisTurn = false;
    infiniteMana = false;
    pendingTargeter: Targeter | null = null;

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
        this.pendingTargeter = null;

        gameEventManager.addEvent(new GameEvent_Log(GameEventType.Log, "Game started"));

        // Shuffle libraries
        for (const player of this.players) {
            player.library.shuffle();
        }

        // Draw 7
        for (const player of this.players) {
            gameEventManager.addEvent(new GameEvent_DrawCard(player, 7));
        }

        this.currentTurnPlayerID = 0;
        this.activePlayerID = -1;
        this.turnNumber = 0;
        this.currentStepIndex = 0;
        this.landPlayedThisTurn = false;

        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));

        this.startStep(this.currentStepIndex);

        if (this.options.allowAutoSkip)
            this.checkAutoSkip();
    }
    nextStep(doAutoSkip: boolean): boolean {
        if (this.pendingTargeter)
            return false;

        this.endStep(this.currentStepIndex);
        this.currentStepIndex++;

        // 103.8a
        if (this.currentStepIndex === StepIndex.Draw && this.turnNumber === 0 && this.players.length === 2)
            this.currentStepIndex++;

        if (this.currentStepIndex > StepIndex.Cleanup)
        {
            this.currentTurnPlayerID = (this.currentTurnPlayerID + 1) % this.players.length;
            this.turnNumber++;
            this.currentStepIndex = 0;
            this.landPlayedThisTurn = false;

            gameEventManager.addEvent(new GameEvent_Simple(GameEventType.TurnStart, "Next turn"));
        }

        this.startStep(this.currentStepIndex);

        if (doAutoSkip)
            this.checkAutoSkip();
        return true;
    }
    skipToNextTurn(): boolean {
        return this.goToStep(StepIndex.Untap, this.options.allowAutoSkip);
    }
    skipToNextPhase(): boolean {
        const nextPhaseIndex = (Step.phaseIndex(this.currentStepIndex) + 1) % Step.NUM_PHASES;
        return this.goToStep(Step.phaseStart(nextPhaseIndex));
    }
    goToStep(index: StepIndex, autoSkip = false): boolean {
        if (!Step.all[index] || !this.nextStep(false))
            return false;

        const advance = () => {
            if (this.currentStepIndex === index) {
                if (autoSkip)
                    this.checkAutoSkip();
                return;
            }

            if (this.nextStep(false))
                gameEventManager.onResolved(advance);
        };
        gameEventManager.onResolved(advance);
        return true;
    }
    canAutoSkip() {
        // Stop at each turn's first main phase even when there are no playable cards.
        if (this.pendingTargeter || this.currentStepIndex === StepIndex.Main)
            return false;

        const player = this.activePlayer();
        return !player || !playerActionManager.playerHasActions(player, true);
    }
    checkAutoSkip() {
        gameEventManager.onResolved(() => {
            if (this.canAutoSkip())
                this.nextStep(true);
        });
    }

    private startStep(index: StepIndex) {
        Step.all[index].onStart(this.currentTurnPlayer());
        gameEventManager.addEvent(new GameEvent_StepStart(this.currentTurnPlayer(), index));
    }
    private endStep(index: StepIndex) {
        Step.all[index].onEnd(this.currentTurnPlayer());

        // 106.4
        for (const player of this.players) {
            player.manaPool.fill(0);
        }
        gameEventManager.addEvent(new GameEvent_StepEnd(this.currentTurnPlayer(), index));
    }

    currentStep() {
        return Step.all[this.currentStepIndex];
    }

    checkState() {
        for (const player of this.players) {
            player.checkState();
        }
    }

    reset() {
        CombatManager.reset();
    }
}

export let game: Game;
