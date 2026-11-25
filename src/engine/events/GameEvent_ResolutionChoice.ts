import type { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import { GameEvent,GameEventType } from "./GameEventManager";

export type PublicCardSelection = {
    readonly player: Player;
    readonly cards: readonly CardObject[];
};

type CardChoiceDetails = {
    readonly player: Player;
    readonly sourceName: string;
    readonly prompt: string;
    readonly options: readonly CardObject[];
    readonly count: number;
};

export type CardChoice = CardChoiceDetails & (
    { readonly visibility: "public"; readonly earlierChoices: readonly PublicCardSelection[] }
    | { readonly visibility: "private" }
);

export type ResolutionChoice = CardChoice & {
    submit(player: Player, cards: readonly CardObject[]): void;
};

export class GameEvent_RequestResolutionChoice extends GameEvent {
    type = GameEventType.RequestResolutionChoice;

    constructor(readonly choice: ResolutionChoice) {
        super();
        this.label = `Player ${choice.player.id} must make a choice for ${choice.sourceName}`;
    }
}

export class GameEvent_SubmitResolutionChoice extends GameEvent {
    type = GameEventType.SubmitResolutionChoice;

    constructor(readonly choice: ResolutionChoice, private readonly accept: () => boolean) {
        super();
        this.label = `Player ${choice.player.id} made a choice for ${choice.sourceName}`;
    }

    perform(): boolean {
        return this.accept();
    }
}
