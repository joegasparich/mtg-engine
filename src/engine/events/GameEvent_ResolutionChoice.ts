import type { DamageAllocationAction } from "@engine/effects/DamagePrevention";
import type { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { CardColour } from "~/defs";
import type { GameEvent_DealDamage } from "./GameEvent_DealDamage";
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
    SpellX,
    SpellMode,
    DamagePreventionOrder,
    DamagePreventionAllocation,
    Optional,
    Colour,
}

export type ColourChoice = {
    readonly kind: ResolutionChoiceKind.Colour;
    readonly player: Player;
    readonly sourceName: string;
    submit(player: Player, colour: CardColour): void;
};

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

export enum OptionalDecision {
    Accept,
    Decline,
}

export type OptionalChoiceDetails = {
    readonly player: Player;
    readonly sourceName: string;
    readonly prompt: string;
    readonly acceptLabel: string;
    readonly declineLabel: string;
};

export type OptionalResolutionChoice = OptionalChoiceDetails & {
    readonly kind: ResolutionChoiceKind.Optional;
    submit(player: Player, decision: OptionalDecision): void;
};

export type SpellXChoice = {
    readonly kind: ResolutionChoiceKind.SpellX;
    readonly player: Player;
    readonly sourceName: string;
    readonly max: number;
    submit(player: Player, x: number | null): void;
};

export type SpellModeChoice = {
    readonly kind: ResolutionChoiceKind.SpellMode;
    readonly player: Player;
    readonly sourceName: string;
    readonly options: readonly { readonly text: string; readonly enabled: boolean }[];
    submit(player: Player, mode: number | null): void;
};

export type DamagePreventionOrderChoice = {
    readonly kind: ResolutionChoiceKind.DamagePreventionOrder;
    readonly player: Player;
    readonly sourceName: string;
    readonly options: readonly string[];
    submit(player: Player, index: number): void;
};

export type DamagePreventionAllocationChoice = {
    readonly kind: ResolutionChoiceKind.DamagePreventionAllocation;
    readonly player: Player;
    readonly sourceName: string;
    readonly hits: readonly GameEvent_DealDamage[];
    readonly total: number;
    readonly action: DamageAllocationAction;
    submit(player: Player, amounts: readonly number[]): void;
};

export type DamagePreventionChoice = DamagePreventionOrderChoice | DamagePreventionAllocationChoice;
export type ResolutionChoice = CardResolutionChoice | ColourChoice | ManaPaymentChoice | OptionalResolutionChoice | SpellXChoice | SpellModeChoice | DamagePreventionChoice;

function isDamagePreventionChoice(choice: ResolutionChoice): choice is DamagePreventionChoice {
    return choice.kind === ResolutionChoiceKind.DamagePreventionOrder
        || choice.kind === ResolutionChoiceKind.DamagePreventionAllocation;
}

export class GameEvent_RequestResolutionChoice extends GameEvent {
    type = GameEventType.RequestResolutionChoice;
    override readonly duringDamagePrevention: boolean;

    constructor(readonly choice: ResolutionChoice) {
        super();
        this.duringDamagePrevention = isDamagePreventionChoice(choice);
        this.label = `Player ${choice.player.id} must make a choice for ${choice.sourceName}`;
    }
}

export class GameEvent_SubmitResolutionChoice extends GameEvent {
    type = GameEventType.SubmitResolutionChoice;
    override readonly duringDamagePrevention: boolean;

    constructor(readonly choice: ResolutionChoice, private readonly accept: () => boolean) {
        super();
        this.duringDamagePrevention = isDamagePreventionChoice(choice);
        this.label = `Player ${choice.player.id} made a choice for ${choice.sourceName}`;
    }

    perform(): boolean {
        return this.accept();
    }
}
