import { CombatManager } from "@engine/CombatManager";
import Player from "@engine/Player";
import { GameEvent_Cleanup,GameEvent_DrawCard,GameEvent_UntapCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";

interface Step {
    onStart?(player: Player): void;
    onEnd?(player: Player): void;
    declarationPlayer?(player: Player): Player | null;
    canConfirm?(): boolean;
    confirm?(): void;
}

export class UntapStep implements Step {
    onStart(player: Player): void {
        // 502.3
        for (const permanent of player.battlefield.objects) {
            if (permanent.tapped)
                gameEventManager.addEvent(new GameEvent_UntapCard(permanent));
        }
    }
}

export class DrawStep implements Step {
    onStart(player: Player): void {
        // 504.1
        gameEventManager.addEvent(new GameEvent_DrawCard(player));
    }
}

export class BeginningOfCombatStep implements Step {
    onStart(player: Player): void {
        CombatManager.attackingPlayer = player;
    }
}

export class DeclareAttackersStep implements Step {
    declarationPlayer(player: Player): Player {
        return player;
    }

    canConfirm(): boolean {
        return CombatManager.canConfirmAttackers();
    }

    confirm(): void {
        CombatManager.confirmAttackers();
    }
}

export class DeclareBlockersStep implements Step {
    declarationPlayer(): Player | null {
        return CombatManager.defendingPlayer;
    }

    canConfirm(): boolean {
        return CombatManager.canConfirmBlocks();
    }

    confirm(): void {
        CombatManager.confirmBlocks();
    }
}

export class CombatDamageStep implements Step {
    constructor(private readonly firstStrike = false) {}

    onStart(): void {
        // 510.1–2: An assignment choice can pause this turn-based action.
        CombatManager.assignCombatDamage(this.firstStrike);
    }
}

export class EndOfCombatStep implements Step {
    onEnd(): void {
        CombatManager.reset();
    }
}

export class CleanupStep implements Step {
    onStart(player: Player): void {
        gameEventManager.performImmediate(new GameEvent_Cleanup(player));
    }
}

export enum StepIndex {
    Untap,
    Upkeep,
    Draw,
    Main,
    BeginningOfCombat,
    DeclareAttackers,
    DeclareBlockers,
    FirstStrikeDamage,
    CombatDamage,
    EndOfCombat,
    SecondMain,
    End,
    Cleanup
}

export enum PhaseIndex {
    Beginning,
    Main,
    Combat,
    SecondMain,
    End
}

export namespace Step {
    export const all: Step[] = [
        new UntapStep(),
        {},
        new DrawStep(),
        {},
        new BeginningOfCombatStep(),
        new DeclareAttackersStep(),
        new DeclareBlockersStep(),
        new CombatDamageStep(true),
        new CombatDamageStep(),
        new EndOfCombatStep(),
        {},
        {},
        new CleanupStep(),
    ];

    export const NUM_PHASES = 5;
    export function phaseIndex(stepIndex: StepIndex): number {
        if (stepIndex <= StepIndex.Draw) return PhaseIndex.Beginning;
        if (stepIndex <= StepIndex.Main) return PhaseIndex.Main;
        if (stepIndex <= StepIndex.EndOfCombat) return PhaseIndex.Combat;
        if (stepIndex <= StepIndex.SecondMain) return PhaseIndex.SecondMain;
        if (stepIndex <= StepIndex.Cleanup) return PhaseIndex.End;
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
            case StepIndex.FirstStrikeDamage: return "First strike damage";
            case StepIndex.CombatDamage: return "Combat damage";
            case StepIndex.EndOfCombat: return "End of combat";
            case StepIndex.SecondMain: return "Second main";
            case StepIndex.End: return "End";
            case StepIndex.Cleanup: return "Cleanup";
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
