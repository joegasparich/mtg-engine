import {GameEvent, GameEventType} from "./GameEventManager";
import Player from "../Player";
import {Step, StepIndex} from "../Step";

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