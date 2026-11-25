import { RegisterAbilityPart } from "@engine/abilities/registry";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { type ManaPaymentChoice,ManaPaymentDecision,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { type ManaCost,ManaUtility } from "@engine/mana";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseManaPayment extends AbilityPart_Effect {
    cost: string;
    onPaySignal?: string;
    onDeclineSignal?: string;

    perform() {
        const { ability } = this;
        const player = ability.controller ?? ability.source.controller;
        if (!player)
            return;

        const cost = ManaUtility.parseManaString<ManaCost>(this.cost);
        const signalResult = (decision: ManaPaymentDecision) => {
            const signal = decision === ManaPaymentDecision.Pay ? this.onPaySignal : this.onDeclineSignal;
            if (signal)
                ability.fireSignal(signal);
        };

        // 118.3, 118.12, 608.2g: Pay the optional cost during resolution if possible and chosen.
        if (!playerActionManager.canAutoPayManaCost(cost, player)) {
            signalResult(ManaPaymentDecision.Decline);
            return;
        }

        const currentGame = game;
        const choice: ManaPaymentChoice = {
            kind: ResolutionChoiceKind.ManaPayment,
            player,
            sourceName: ability.source.name,
            cost: this.cost,
            submit: (actor, decision) => {
                currentGame.submitResolutionChoice(choice, actor, () => decision === ManaPaymentDecision.Decline
                    || (decision === ManaPaymentDecision.Pay && playerActionManager.payManaCost(cost, player)),
                () => signalResult(decision));
            },
        };
        currentGame.openResolutionChoice(choice);
    }
}
