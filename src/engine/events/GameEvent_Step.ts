import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Step,StepIndex } from "@engine/Step";

export class GameEvent_Advance extends GameEvent {
    type = GameEventType.Advance;
    label = "Advance game";

    constructor(readonly player = game.activePlayer()) {
        super();
    }

    perform(): boolean {
        return game.advance(this.player);
    }
}

export class GameEvent_PriorityChanged extends GameEvent {
    type = GameEventType.PriorityChanged;
    label: string;

    constructor(readonly player: Player | null) {
        super();
        this.label = player ? `Player ${player.id} received priority` : "Priority cleared";
    }
}

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

export class GameEvent_TurnStart extends GameEvent {
    type = GameEventType.TurnStart;
    label = "Next turn";

    constructor(readonly player: Player) {
        super();
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

export class GameEvent_Cleanup extends GameEvent {
    type = GameEventType.Cleanup;
    label = "Clear damage and end temporary effects";

    constructor(readonly player: Player) {
        super();
    }

    perform(): boolean {
        // 514.2: Damage clears and temporary effects end as the same turn-based action.
        for (const player of game.players) {
            for (const permanent of player.battlefield.objects)
                permanent.damageTaken = 0;
        }
        return true;
    }
}
