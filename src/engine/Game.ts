import playerActionManager,{ Targeter } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_DrawCards,GameEvent_StepEnd,GameEvent_StepStart,GameEvent_TurnStart } from "@engine/events";
import { type CombatDamageAssignment,type CombatDamageChoice,GameEvent_RequestCombatDamageChoice,GameEvent_SubmitCombatDamageChoice } from "@engine/events/GameEvent_CombatDamageChoice";
import { type CardChoice,GameEvent_RequestResolutionChoice,GameEvent_SubmitResolutionChoice,type ResolutionChoice } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ type GameEvent,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import type { CardObject } from "@engine/GameObject";
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
    private resolutionChoice: ResolutionChoice | null = null;
    private combatDamageChoice: CombatDamageChoice | null = null;

    get pendingResolutionChoice() { return this.resolutionChoice; }
    get pendingCombatDamageChoice() { return this.combatDamageChoice; }
    get hasPendingPlayerInput() { return !!(this.pendingTargeter || this.resolutionChoice || this.combatDamageChoice); }

    static init() {
        CombatManager.reset();
        game = new Game();
        gameEventManager.startGame(() => game.settleState(), () => !!(game.pendingResolutionChoice || game.pendingCombatDamageChoice));
    }

    requestResolutionChoice(details: CardChoice, resume: (cards: readonly CardObject[]) => void) {
        if (this.hasPendingPlayerInput)
            throw new Error("A player choice is already pending");

        const optionZones = new Map(details.options.map(card => [card, card.zone]));
        const choice: ResolutionChoice = {
            ...details,
            submit: (player, cards) => {
                if (game !== this || this.resolutionChoice !== choice || player !== choice.player)
                    return;

                const selected = [...cards];
                const event = new GameEvent_SubmitResolutionChoice(choice, () => {
                    if (this.resolutionChoice !== choice || selected.length !== choice.count
                        || new Set(selected).size !== selected.length
                        || selected.some(card => !card.zone || optionZones.get(card) !== card.zone))
                        return false;

                    this.resolutionChoice = null;
                    return true;
                });
                event.then(() => resume(selected));
                gameEventManager.addEvent(event);
            },
        };
        this.resolutionChoice = choice;
        gameEventManager.addEvent(new GameEvent_RequestResolutionChoice(choice));
    }

    requestCombatDamageChoice(details: CombatDamageAssignment, resume: (amounts: readonly number[]) => void) {
        if (this.hasPendingPlayerInput)
            throw new Error("A player choice is already pending");

        const choice: CombatDamageChoice = {
            ...details,
            submit: (player, amounts) => {
                if (game !== this || this.combatDamageChoice !== choice || player !== choice.player)
                    return;

                const assigned = [...amounts];
                gameEventManager.addEvent(new GameEvent_SubmitCombatDamageChoice(choice, () => {
                    if (this.combatDamageChoice !== choice || assigned.length !== choice.recipients.length
                        || assigned.some(amount => !Number.isInteger(amount) || amount < 0)
                        || assigned.reduce((total, amount) => total + amount, 0) !== choice.total)
                        return false;

                    this.combatDamageChoice = null;
                    resume(assigned);
                    return true;
                }));
            },
        };
        this.combatDamageChoice = choice;
        gameEventManager.addEvent(new GameEvent_RequestCombatDamageChoice(choice));
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
            gameEventManager.addEvent(new GameEvent_DrawCards(player, 7));
        }

        this.currentTurnPlayerID = 0;
        this.activePlayerID = -1;
        this.turnNumber = 0;
        this.currentStepIndex = 0;
        this.landPlayedThisTurn = false;

        gameEventManager.addEvent(new GameEvent_TurnStart(this.currentTurnPlayer()));

        this.startStep(this.currentStepIndex);

        if (this.options.allowAutoSkip)
            this.checkAutoSkip();
    }
    nextStep(doAutoSkip: boolean): boolean {
        if (this.hasPendingPlayerInput || this.currentStep().canEnd?.() === false)
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

            gameEventManager.addEvent(new GameEvent_TurnStart(this.currentTurnPlayer()));
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
                gameEventManager.onIdle(advance);
        };
        gameEventManager.onIdle(advance);
        return true;
    }
    canAutoSkip() {
        // Stop at each turn's first main phase even when there are no playable cards.
        if (this.hasPendingPlayerInput || this.currentStepIndex === StepIndex.Main)
            return false;

        const player = this.activePlayer();
        return !player || !playerActionManager.playerHasActions(player, true);
    }
    checkAutoSkip() {
        gameEventManager.onIdle(() => {
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
        gameEventManager.performAllEvents();
    }

    private settleState(): boolean {
        if (this.stack.finishResolution())
            return true;

        // 502.4: The untap step has no priority check. Cleanup still checks under 514.3a.
        if (this.options && this.currentStepIndex === StepIndex.Untap)
            return false;

        const actions: GameEvent[] = [];
        for (const player of this.players) {
            for (const permanent of player.battlefield.objects)
                permanent.checkState(actions);
        }

        // 117.5 and 704.3: Repeat the checks before putting waiting triggers on the stack.
        if (actions.length && gameEventManager.performSimultaneous(actions))
            return true;
        return this.stack.putWaitingTriggersOnStack();
    }

    reset() {
        this.combatDamageChoice = null;
        CombatManager.reset();
    }
}

export let game: Game;
