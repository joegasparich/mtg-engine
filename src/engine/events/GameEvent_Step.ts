import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Step,StepIndex } from "@engine/Step";

export class GameEvent_GoToNextStep extends GameEvent {
    constructor() {
        super();

        this.type = GameEventType.GoToNextStep;
        this.label = "Go to next step";
    }

    perform(): boolean {
        return game.nextStep(game.options.allowAutoSkip);
    }
}
export class GameEvent_GoToStep extends GameEvent {
    index: StepIndex;

    constructor(index: StepIndex) {
        super();

        this.type = GameEventType.GoToStep;
        this.label = `Go to ${Step.toString(index)}`;

        this.index = index;
    }

    perform(): boolean {
        return game.goToStep(this.index);
    }
}

export class GameEvent_GoToNextPhase extends GameEvent {

    constructor() {
        super();

        this.type = GameEventType.GoToNextPhase;
        this.label = "Go to next phase";
    }

    perform(): boolean {
        return game.skipToNextPhase();
    }
}

export class GameEvent_GoToNextTurn extends GameEvent {
    constructor() {
        super();

        this.type = GameEventType.GoToNextTurn;
        this.label = "Go to next turn";
    }

    perform(): boolean {
        return game.skipToNextTurn();
    }
}

export class GameEvent_StepStart extends GameEvent {
    type = GameEventType.StepStart;

    player: Player;
    stepIndex: StepIndex;

    constructor(player: Player, stepIndex: StepIndex) {
        super();

        this.player = player;
        this.stepIndex = stepIndex;

        this.label = `Player ${this.player.id} entered step ${Step.toString(this.stepIndex)}`;
    }
}

export class GameEvent_StepEnd extends GameEvent {
    type = GameEventType.StepEnd;

    player: Player;
    stepIndex: StepIndex;

    constructor(player: Player, step: StepIndex) {
        super();

        this.player = player;
        this.stepIndex = step;

        this.label = `Player ${this.player.id} exited step ${Step.toString(this.stepIndex)}`;
    }
}
