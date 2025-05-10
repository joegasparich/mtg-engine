import Player from "./Player";
import gameEventManager from "./events/GameEventManager";
import GameEvent_UntapCard from "./events/GameEvent_UntapCard";
import {GameEvent_DrawCard} from "./events/GameEvent_DrawCard";
import DOMLabel from "../ui/dom/DOMLabel";
import {autobind} from "../utility/typeUtility";
import uiEventManager, {
    UIEvent_CardClicked, UIEvent_CardDeselected, UIEvent_CardSelected,
    UIEventType
} from "../ui/UIEventManager";
import {CombatManager} from "./CombatManager";
import {game} from "./root";
import DOMButton from "../ui/dom/DOMButton";
import {GameEvent_TapCard} from "./events";

interface Step {
    onStart(player: Player): void;
    onEnd(player: Player): void;
}

class UntapStep implements Step {
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

class UpkeepStep implements Step {
    onStart(player: Player): void {
        // 503.1
        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

class DrawStep implements Step {
    onStart(player: Player): void {
        // 504.1
        gameEventManager.addEvent(new GameEvent_DrawCard(player));

        // 504.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

class MainStep implements Step {
    onStart(player: Player): void {
        // 505.6

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

class BeginningOfCombatStep implements Step {
    onStart(player: Player): void {
        CombatManager.attackingPlayer = game.currentTurnPlayer();
        // 507.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

class DeclareAttackersStep implements Step {
    messageLabel: DOMLabel;
    finishDeclaring: DOMButton;

    constructor() {
        this.messageLabel = new DOMLabel("Declare attackers", { top: '0', left: '0', right: '0' });
        this.messageLabel.className = "message";
        this.messageLabel.hide();

        this.finishDeclaring = new DOMButton("Finish declaring", { top: '75px', left: '45%', right: '45%' }, this.onFinishDeclaring);
        this.finishDeclaring.hide();
    }

    onStart(player: Player): void {
        // 508.1
        this.messageLabel.show();
        this.finishDeclaring.show();
        uiEventManager.on(UIEventType.CardClicked, this.onCardClicked)
        // this.messageLabel.hide();
        // this.finishDeclaring.hide();
    }
    onEnd(player: Player): void {
        this.messageLabel.hide(); // Temp
        this.finishDeclaring.hide();
        uiEventManager.off(UIEventType.CardClicked, this.onCardClicked)
    }

    @autobind
    onCardClicked(event: UIEvent_CardClicked) {
        if (CombatManager.attackingCreatures.has(event.card)) {
            CombatManager.attackingCreatures.delete(event.card);
            uiEventManager.fire(new UIEvent_CardDeselected(event.card));
        }
        else if (CombatManager.canAttack(event.card)) {
            CombatManager.attackingCreatures.set(event.card, game.randomOpponent(game.currentTurnPlayer())); // TODO: Target player or planeswalker
            uiEventManager.fire(new UIEvent_CardSelected(event.card));
        }
    }

    @autobind
    onFinishDeclaring() {
        // 508.1f
        for (let card of CombatManager.attackingCreatures.keys()) {
            gameEventManager.addEvent(new GameEvent_TapCard(card));
        }

        // 508.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority

        game.nextStep();
    }
}

class DeclareBlockersStep implements Step {
    messageLabel: DOMLabel;
    finishDeclaring: DOMButton;

    constructor() {
        this.messageLabel = new DOMLabel("Declare blockers", { top: '0', left: '0', right: '0'});
        this.messageLabel.className = "message";
        this.messageLabel.hide();

        this.finishDeclaring = new DOMButton("Finish declaring", { top: '75px', left: '45%', right: '45%' }, this.onFinishDeclaring);
        this.finishDeclaring.hide();
    }

    onStart(player: Player): void {
        // 509.1
        this.messageLabel.show();
        this.finishDeclaring.show();
        uiEventManager.on(UIEventType.CardClicked, this.onCardClicked)
        // this.messageLabel.hide();
        // this.finishDeclaring.hide();
    }
    onEnd(player: Player): void {
        this.messageLabel.hide(); // Temp
        this.finishDeclaring.hide();
        uiEventManager.off(UIEventType.CardClicked, this.onCardClicked)
    }

    @autobind
    onCardClicked(event: UIEvent_CardClicked) {
        if (CombatManager.blockingCreatures.has(event.card)) {
            CombatManager.blockingCreatures.delete(event.card);
            uiEventManager.fire(new UIEvent_CardDeselected(event.card));
        }
        else if (CombatManager.canBlock(event.card)) {
            CombatManager.blockingCreatures.set(event.card, null) // TODO: Target attacking creature
            uiEventManager.fire(new UIEvent_CardSelected(event.card))
        }
    }

    @autobind
    onFinishDeclaring() {
        // 508.2

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority

        game.nextStep();
    }
}

class CombatDamageStep implements Step {
    onStart(player: Player): void {
        // 510.1
        // TODO: Calculate combat damage

        // 510.2
        // TODO: Assign combat damage

        // 510.3

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {}
}

class EndOfCombatStep implements Step {
    onStart(player: Player): void {
        // 511.1

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player): void {
        for (let card of CombatManager.attackingCreatures.keys()) {
            uiEventManager.fire(new UIEvent_CardDeselected(card));
        }
        for (let card of CombatManager.blockingCreatures.keys()) {
            uiEventManager.fire(new UIEvent_CardDeselected(card));
        }

        CombatManager.reset();
    }
}

class SecondMainStep implements Step {
    onStart(player: Player) {
        // 505.6

        game.activePlayerID = game.currentTurnPlayerID;
        // TODO: Pass priority
    }
    onEnd(player: Player) {}
}

class EndStep implements Step {
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

export class phaseStart {
}