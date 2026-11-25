import type { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import { GameEvent,GameEventType } from "./GameEventManager";

export type PublicCardSelection = {
    readonly player: Player;
    readonly cards: readonly CardObject[];
};

export enum CardChoicePresentation {
    Board,
    SingleCardList,
}

export enum CardChoiceVisibility {
    Public = "public",
    Private = "private",
}

type CardChoiceDetails = {
    readonly player: Player;
    readonly sourceName: string;
    readonly prompt: string;
    readonly options: readonly CardObject[];
} & (
    { readonly count: number; readonly presentation?: CardChoicePresentation.Board }
    | { readonly count: 1; readonly presentation: CardChoicePresentation.SingleCardList }
);

export type CardChoice = CardChoiceDetails & (
    { readonly visibility: CardChoiceVisibility.Public; readonly earlierChoices: readonly PublicCardSelection[] }
    | { readonly visibility: CardChoiceVisibility.Private }
);

export enum ResolutionChoiceKind {
    Card,
    ManaPayment,
}

export type CardResolutionChoice = CardChoice & {
    readonly kind: ResolutionChoiceKind.Card;
    submit(player: Player, cards: readonly CardObject[]): void;
};

export enum ManaPaymentDecision {
    Pay,
    Decline,
}

export type ManaPaymentChoice = {
    readonly kind: ResolutionChoiceKind.ManaPayment;
    readonly player: Player;
    readonly sourceName: string;
    readonly cost: string;
    submit(player: Player, decision: ManaPaymentDecision): void;
};

export type ResolutionChoice = CardResolutionChoice | ManaPaymentChoice;

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
