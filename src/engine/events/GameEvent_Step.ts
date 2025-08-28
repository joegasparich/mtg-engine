import {GameEvent, GameEventType} from "@engine/events/GameEventManager";
import {game} from "@engine/Game";
import {Step, StepIndex} from "@engine/Step";
import Player from "@engine/Player";

export class GameEvent_GoToNextStep extends GameEvent {
    constructor() {
        super();

        this.type = GameEventType.GoToNextStep;
        this.label = "Go to next turn";
    }

    perform() {
        game.nextStep(game.options.allowAutoSkip);
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

    perform() {
        do {
            game.nextStep(false);
        } while (game.currentStepIndex != this.index);
    }
}

export class GameEvent_GoToNextPhase extends GameEvent {

    constructor() {
        super();

        this.type = GameEventType.GoToNextPhase;
        this.label = "Go to next turn";
    }

    perform() {
        game.skipToNextPhase();
    }
}

export class GameEvent_GoToNextTurn extends GameEvent {
    constructor() {
        super();

        this.type = GameEventType.GoToNextTurn;
        this.label = "Go to next turn";
    }

    perform() {
        game.skipToNextTurn();
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

    perform() {}
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

    perform() {}
}