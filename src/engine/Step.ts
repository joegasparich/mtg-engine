import Player from "@engine/Player";
import {game} from "@engine/Game";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_DrawCard, GameEvent_TapCard, GameEvent_UntapCard} from "@engine/events";
import {CombatManager} from "@engine/CombatManager";
import {autobind} from "@utility/typeUtility";
import uiEventManager, {UIEvent_CardDeselected} from "@ui/UIEventManager";

interface Step {
    message: string | null;
    buttons: [string, (() => void)][]

    onStart(player: Player): void;
    onEnd(player: Player): void;
}

export class UntapStep implements Step {
    message: string = null;
    buttons: [label: string, action: () => void][] = [];

    onStart(player: Player): void {
        // Does not give priority: 502.4
        game.activePlayerID = -1;

        // 502.3
        for (const card of player.battlefield.cards) {
            if (card.tapped)
                gameEventManager.addEvent(new GameEvent_UntapCard(card));
        }
    }

    onEnd(player: Player): void {}
}

export class UpkeepStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        // 503.1
        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

export class DrawStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        // 504.1
        gameEventManager.addEvent(new GameEvent_DrawCard(player));

        // 504.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

export class MainStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        // 505.6

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

export class BeginningOfCombatStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        CombatManager.attackingPlayer = game.currentTurnPlayer();
        // 507.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

export class DeclareAttackersStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        // 508.1
        this.message = "Declare attackers";
        this.buttons = [["Finish declaring", this.onFinishDeclaring]];
    }
    onEnd(player: Player): void {}

    @autobind
    onFinishDeclaring() {
        // 508.1f
        for (const card of CombatManager.attackingCreatures.keys()) {
            gameEventManager.addEvent(new GameEvent_TapCard(card));
        }

        // 508.2
        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority

        game.nextStep(game.options.allowAutoSkip);
    }
}

export class DeclareBlockersStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];

    onStart(player: Player): void {
        // 509.1
        this.message = "Declare blockers";
        this.buttons = [["Finish declaring", this.onFinishDeclaring]];

        // TODO: Remove once priority is in
        if (game.players.length > 1)
            game.activePlayerID = game.randomOpponent(player).id;
    }
    onEnd(player: Player): void {
        game.activePlayerID = game.currentTurnPlayerID;
    }

    @autobind
    onFinishDeclaring() {
        // 508.2
        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority

        game.nextStep(game.options.allowAutoSkip);
    }
}

export class CombatDamageStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];
    onStart(player: Player): void {
        // 510.1, 510.2
        CombatManager.calculateAndAssignDamage();

        // TODO: This should happen when a player gets priority
        game.checkState();

        // 510.3
        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

export class EndOfCombatStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];
    onStart(player: Player): void {
        // 511.1

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {
        for (const card of CombatManager.attackingCreatures.keys()) {
            uiEventManager.fire(new UIEvent_CardDeselected(card));
        }
        for (const card of CombatManager.blockingCreatures.keys()) {
            uiEventManager.fire(new UIEvent_CardDeselected(card));
        }

        CombatManager.reset();
    }
}

export class SecondMainStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];
    onStart(player: Player) {
        // 505.6

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player) {}
}

export class EndStep implements Step {
    message: string = null;
    buttons: [string, () => void][] = [];
    onStart(player: Player) {
        // 513.1

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player) {}
}

export enum StepIndex {
    Untap,
    Upkeep,
    Draw,
    Main,
    BeginningOfCombat,
    DeclareAttackers,
    DeclareBlockers,
    CombatDamage,
    EndOfCombat,
    SecondMain,
    End
}

export enum PhaseIndex {
    Beginning,
    Main,
    Combat,
    SecondMain,
    End
}

export namespace Step {
    export const all = [
        new UntapStep(),
        new UpkeepStep(),
        new DrawStep(),
        new MainStep(),
        new BeginningOfCombatStep(),
        new DeclareAttackersStep(),
        new DeclareBlockersStep(),
        new CombatDamageStep(),
        new EndOfCombatStep(),
        new SecondMainStep(),
        new EndStep(),
    ];

    export const NUM_PHASES = 5;
    export function phaseIndex(stepIndex: StepIndex): number {
        if (stepIndex <= StepIndex.Draw) return PhaseIndex.Beginning;
        if (stepIndex <= StepIndex.Main) return PhaseIndex.Main;
        if (stepIndex <= StepIndex.EndOfCombat) return PhaseIndex.Combat;
        if (stepIndex <= StepIndex.SecondMain) return PhaseIndex.SecondMain;
        if (stepIndex <= StepIndex.End) return PhaseIndex.End;
    }
    export function phaseStart(phaseIndex: number): StepIndex {
        switch (phaseIndex) {
            case PhaseIndex.Beginning: return StepIndex.Untap;
            case PhaseIndex.Main: return StepIndex.Main;
            case PhaseIndex.Combat: return StepIndex.BeginningOfCombat;
            case PhaseIndex.SecondMain: return StepIndex.SecondMain;
            case PhaseIndex.End: return StepIndex.End;
        }
    }

    export function toString(stepIndex: StepIndex): string {
        switch (stepIndex) {
            case StepIndex.Untap: return "Untap";
            case StepIndex.Upkeep: return "Upkeep";
            case StepIndex.Draw: return "Draw";
            case StepIndex.Main: return "Main";
            case StepIndex.BeginningOfCombat: return "Beginning of combat";
            case StepIndex.DeclareAttackers: return "Declare attackers";
            case StepIndex.DeclareBlockers: return "Declare blockers";
            case StepIndex.CombatDamage: return "Combat damage";
            case StepIndex.EndOfCombat: return "End of combat";
            case StepIndex.SecondMain: return "Second main";
            case StepIndex.End: return "End";
        }
    }

    export function toStringPhase(phaseIndex: PhaseIndex): string {
        switch (phaseIndex) {
            case PhaseIndex.Beginning: return "Beginning";
            case PhaseIndex.Main: return "Main";
            case PhaseIndex.Combat: return "Combat";
            case PhaseIndex.SecondMain: return "Second main";
            case PhaseIndex.End: return "End";
        }
    }
}
