import playerActionManager,{ Targeter } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_DrawCards,GameEvent_PriorityChanged,GameEvent_StepEnd,GameEvent_StepStart,GameEvent_TurnStart } from "@engine/events";
import { type CombatDamageAssignment,type CombatDamageChoice,GameEvent_RequestCombatDamageChoice,GameEvent_SubmitCombatDamageChoice } from "@engine/events/GameEvent_CombatDamageChoice";
import { type CardChoice,type CardResolutionChoice,GameEvent_RequestResolutionChoice,GameEvent_SubmitResolutionChoice,type ResolutionChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ type GameEvent,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import { type CardObject,Spell } from "@engine/GameObject";
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
    turnNumber = 0;
    currentStepIndex = 0;
    landPlayedThisTurn = false;
    infiniteMana = false;
    autoPassPriority = false;
    pendingTargeter: Targeter | null = null;
    private priority: Player | null = null;
    private pendingPriority: Player | null = null;
    private passes = 0;
    private autoAdvance = false;
    private cleanupNeedsPriority = false;
    declarationPlayer: Player | null = null;
    private resolutionChoice: ResolutionChoice | null = null;
    private combatDamageChoice: CombatDamageChoice | null = null;

    get pendingResolutionChoice() {
        return this.resolutionChoice?.kind === ResolutionChoiceKind.Card ? this.resolutionChoice : null;
    }
    get pendingManaPaymentChoice() {
        return this.resolutionChoice?.kind === ResolutionChoiceKind.ManaPayment ? this.resolutionChoice : null;
    }
    get hasPendingResolutionChoice() { return this.resolutionChoice !== null; }
    get pendingCombatDamageChoice() { return this.combatDamageChoice; }
    get hasPendingPlayerInput() { return !!(this.pendingTargeter || this.resolutionChoice || this.combatDamageChoice); }
    get priorityPlayer() { return this.hasPendingPlayerInput || this.stack.isResolving ? null : this.priority; }
    get canEndTurn() {
        return this.currentStepIndex === StepIndex.End && !this.stack.objects.length
            && this.priorityPlayer === this.currentTurnPlayer();
    }

    static init() {
        if (game) {
            for (const player of game.players) {
                for (const zone of player.zones) {
                    for (const object of zone.objects)
                        object.abilities.forEach(ability => ability.cleanup());
                }
            }
            for (const object of game.stack.objects) {
                if (object instanceof Spell)
                    object.abilities.forEach(ability => ability.cleanup());
            }
        }
        CombatManager.reset();
        game = new Game();
        gameEventManager.startGame(() => game.settleState(),
            () => game.hasPendingResolutionChoice || !!game.pendingCombatDamageChoice,
            () => game.advanceWhileIdle());
    }

    requestResolutionChoice(details: CardChoice, resume: (cards: readonly CardObject[]) => void,
        isStillEligible?: (card: CardObject) => boolean) {
        const optionZones = new Map(details.options.map(card => [card, card.zone]));
        const choice: CardResolutionChoice = {
            ...details,
            kind: ResolutionChoiceKind.Card,
            submit: (player, cards) => {
                const selected = [...cards];
                this.submitResolutionChoice(choice, player, () => selected.length === choice.count
                    && new Set(selected).size === selected.length
                    && selected.every(card => optionZones.has(card) && (isStillEligible
                        ? isStillEligible(card)
                        : !!card.zone && optionZones.get(card) === card.zone)), () => resume(selected));
            },
        };
        this.openResolutionChoice(choice);
    }

    openResolutionChoice(choice: ResolutionChoice) {
        if (this.hasPendingPlayerInput)
            throw new Error("A player choice is already pending");

        this.resolutionChoice = choice;
        gameEventManager.addEvent(new GameEvent_RequestResolutionChoice(choice));
    }

    submitResolutionChoice(choice: ResolutionChoice, player: Player, accept: () => boolean, resume: () => void) {
        if (game !== this || this.resolutionChoice !== choice || player !== choice.player)
            return;

        const event = new GameEvent_SubmitResolutionChoice(choice, () => {
            if (this.resolutionChoice !== choice || !accept())
                return false;

            this.resolutionChoice = null;
            return true;
        });
        event.then(resume);
        gameEventManager.addEvent(event);
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
        return this.declarationPlayer ?? this.priorityPlayer;
    }
    randomOpponent(player: Player): Player {
        return this.players[(player.id + 1) % this.players.length]; // TODO: Randomize
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
        this.turnNumber = 0;
        this.currentStepIndex = 0;
        this.landPlayedThisTurn = false;

        gameEventManager.addEvent(new GameEvent_TurnStart(this.currentTurnPlayer()));

        this.startStep(this.currentStepIndex);
        this.autoAdvance = this.options.allowAutoSkip;
        this.checkState();
    }

    advance(player: Player | null): boolean {
        if (!this.options || this.hasPendingPlayerInput || this.stack.isResolving || player !== this.activePlayer())
            return false;

        this.autoAdvance = this.options.allowAutoSkip;
        if (this.declarationPlayer)
            return this.confirmDeclaration();
        if (player)
            return this.passPriority(player);
        if (this.currentStepIndex === StepIndex.Untap || this.currentStepIndex === StepIndex.Cleanup)
            return this.nextStep(this.options.allowAutoSkip);
        return false;
    }

    notePriorityAction() {
        // 117.3c, 117.4: A player retains priority after acting and starts a new round of passes.
        this.passes = 0;
    }

    private passPriority(player: Player): boolean {
        this.passes++;
        if (this.passes < this.players.length) {
            this.priority = null;
            this.pendingPriority = this.players[(player.id + 1) % this.players.length];
            return true;
        }

        // 117.4: A full round of passes resolves one object or ends the step.
        this.setPriority(null);
        this.passes = 0;
        if (this.stack.resolveTop(resolved => {
            // A prevented zone change can leave the same spell on the stack.
            if (!resolved)
                this.autoAdvance = false;
            this.pendingPriority = this.currentTurnPlayer();
        }))
            return true;

        if (this.currentStepIndex === StepIndex.Cleanup) {
            // 514.3a: Priority in cleanup is followed by another cleanup step.
            this.endStep(this.currentStepIndex);
            this.startStep(this.currentStepIndex);
            return true;
        }
        return this.nextStep(this.autoAdvance, true);
    }

    private confirmDeclaration(): boolean {
        const step = this.currentStep();
        if (step.canConfirm?.() === false)
            return false;

        this.declarationPlayer = null;
        step.confirm?.();
        // 508.2, 509.2: The turn player gets priority after combat declarations.
        this.pendingPriority = this.currentTurnPlayer();
        return true;
    }

    private setPriority(player: Player | null) {
        if (this.priority === player)
            return;

        this.priority = player;
        gameEventManager.addEvent(new GameEvent_PriorityChanged(player));
    }

    nextStep(doAutoSkip: boolean, skipEmptyCombat = false): boolean {
        if (this.hasPendingPlayerInput || this.stack.isResolving || this.stack.objects.length
            || (this.declarationPlayer && !this.confirmDeclaration()))
            return false;

        this.setPriority(null);
        this.pendingPriority = null;
        this.passes = 0;
        this.autoAdvance = doAutoSkip;
        this.endStep(this.currentStepIndex);
        // 508.8: Without attackers, go straight from declare attackers to end of combat.
        if (skipEmptyCombat && this.currentStepIndex === StepIndex.DeclareAttackers
            && !CombatManager.declaredAnyAttackers && !CombatManager.attackingCreatures.size) {
            this.currentStepIndex = StepIndex.EndOfCombat;
        } else {
            this.currentStepIndex++;
        }

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
                this.autoAdvance = autoSkip;
                return;
            }

            if (this.nextStep(false))
                gameEventManager.onIdle(advance);
        };
        gameEventManager.onIdle(advance);
        return true;
    }
    private advanceWhileIdle(): boolean {
        if (!this.autoAdvance || this.hasPendingPlayerInput || this.stack.isResolving)
            return false;

        if (this.declarationPlayer)
            return !playerActionManager.playerHasActions(this.declarationPlayer, true) && this.confirmDeclaration();

        const player = this.priorityPlayer;
        if (player) {
            // 505.2 and 505.6: Pause for the active player's pass before ending either main phase.
            const mainPhase = this.currentStepIndex === StepIndex.Main || this.currentStepIndex === StepIndex.SecondMain;
            const awaitingMainPhasePass = mainPhase && player === this.currentTurnPlayer() && !this.stack.objects.length;
            return !awaitingMainPhasePass && !this.canEndTurn
                && (this.autoPassPriority || !playerActionManager.playerHasActions(player, true))
                && this.passPriority(player);
        }
        return this.advance(null);
    }
    private startStep(index: StepIndex) {
        const player = this.currentTurnPlayer();
        const step = Step.all[index];
        this.cleanupNeedsPriority = false;
        this.declarationPlayer = step.declarationPlayer?.(player) ?? null;
        step.onStart?.(player);
        if (!this.declarationPlayer && index !== StepIndex.Untap && index !== StepIndex.Cleanup)
            this.pendingPriority = player;
        gameEventManager.addEvent(new GameEvent_StepStart(player, index));
    }
    private endStep(index: StepIndex) {
        Step.all[index].onEnd?.(this.currentTurnPlayer());

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
        const stateChanged = actions.length > 0 && gameEventManager.performSimultaneous(actions);
        const triggersAdded = !stateChanged && !this.declarationPlayer && this.stack.putWaitingTriggersOnStack();
        if (this.options && this.currentStepIndex === StepIndex.Cleanup && (stateChanged || triggersAdded))
            this.cleanupNeedsPriority = true;
        if (stateChanged || triggersAdded)
            return true;

        if (this.stack.isResolving)
            return false;

        if (this.pendingPriority || this.cleanupNeedsPriority) {
            const player = this.pendingPriority ?? this.currentTurnPlayer();
            this.pendingPriority = null;
            this.cleanupNeedsPriority = false;
            this.setPriority(player);
            return true;
        }
        return false;
    }

    reset() {
        this.combatDamageChoice = null;
        CombatManager.reset();
    }
}

export let game: Game;
