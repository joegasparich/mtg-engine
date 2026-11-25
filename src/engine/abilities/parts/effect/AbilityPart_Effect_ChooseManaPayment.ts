import { RegisterAbilityPart } from "@engine/abilities/registry";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { type ManaPaymentChoice,ManaPaymentDecision,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { type ManaCost,ManaUtility } from "@engine/mana";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseManaPayment extends AbilityPart_Effect {
    cost: string;
    onDeclineSignal: string;

    perform() {
        const { ability } = this;
        const player = ability.controller ?? ability.source.controller;
        if (!player)
            return;

        const cost = ManaUtility.parseManaString<ManaCost>(this.cost);
        const decline = () => ability.fireSignal(this.onDeclineSignal);

        // 118.3, 118.12a: Pay the optional cost during resolution if possible and chosen.
        if (!playerActionManager.canAutoPayManaCost(cost, player)) {
            decline();
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
                    || (decision === ManaPaymentDecision.Pay && playerActionManager.payManaCost(cost, player)), () => {
                    if (decision === ManaPaymentDecision.Decline)
                        decline();
                });
            },
        };
        currentGame.openResolutionChoice(choice);
    }
}
