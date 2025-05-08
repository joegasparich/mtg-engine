import Player from "./Player";
import gameEventManager from "./GameEvents/GameEventManager";
import GameEvent_UntapCard from "./GameEvents/GameEvent_UntapCard";
import {GameEvent_DrawCard} from "./GameEvents/GameEvent_DrawCard";

interface Step {
    onStart(player: Player): void;
    onEnd(player: Player): void;
}

class UntapStep implements Step {
    onStart(player: Player): void {
        // Does not give priority: 502.4

        // 502.3
        for (const card of player.battlefield.cards) {
            if (card.Tapped())
                gameEventManager.addEvent(new GameEvent_UntapCard(card));
        }
    }

    onEnd(player: Player): void {}
}

class UpkeepStep implements Step {
    onStart(player: Player): void {
        // 503.1
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class DrawStep implements Step {
    onStart(player: Player): void {
        // 504.1
        gameEventManager.addEvent(new GameEvent_DrawCard(player));

        // 504.2
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class MainStep implements Step {
    onStart(player: Player): void {
        // 505.6
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class BeginningOfCombatStep implements Step {
    onStart(player: Player): void {
        // 507.2
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class DeclareAttackersStep implements Step {
    onStart(player: Player): void {
        // 508.1
        // TODO: Declare attackers

        // 508.2
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class DeclareBlockersStep implements Step {
    onStart(player: Player): void {
        // 509.1
        // TODO: Declare blockers

        // 509.2
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class CombatDamageStep implements Step {
    onStart(player: Player): void {
        // 510.1
        // TODO: Calculate combat damage

        // 510.2
        // TODO: Assign combat damage

        // 510.3
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class EndOfCombatStep implements Step {
    onStart(player: Player): void {
        // 511.1
        // TODO: Give priority
    }
    onEnd(player: Player): void {}
}

class SecondMainStep implements Step {
    onStart(player: Player) {
        // 505.6
        // TODO: Give priority
    }
    onEnd(player: Player) {}
}

class EndStep implements Step {
    onStart(player: Player) {
        // 513.1
        // TODO: Give priority
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

export namespace Step {
    export const Untap = new UntapStep();
    export const Upkeep = new UpkeepStep();
    export const Draw = new DrawStep();
    export const Main = new MainStep();
    export const BeginningOfCombat = new BeginningOfCombatStep();
    export const DeclareAttackers = new DeclareAttackersStep();
    export const DeclareBlockers = new DeclareBlockersStep();
    export const CombatDamage = new CombatDamageStep();
    export const EndOfCombat = new EndOfCombatStep();
    export const SecondMain = new SecondMainStep();
    export const End = new EndStep();

    export const all = [
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
    ];

    export function toString(index: StepIndex): string {
        switch (index) {
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
}