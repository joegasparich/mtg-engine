import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { type ManaPaymentChoice,ManaPaymentDecision,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { Spell } from "@engine/GameObject";
import { type ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseManaPayment extends AbilityPart_Effect {
    cost: string;
    player?: GrammarKey;
    onPaySignal?: string;
    onDeclineSignal?: string;

    perform() {
        const { ability } = this;
        const player = this.player === undefined ? ability.controller ?? ability.source.controller
            : resolveAbilityGrammar(this.player, ability);
        if (!(player instanceof Player))
            return;

        // CR 107.3i: X in a resolving spell's text has the value chosen for that spell.
        const x = ability.source instanceof Spell ? ability.source.chosenX : 0;
        const payment = this.cost.replaceAll("{X}", `{${x}}`);
        const cost = ManaUtility.parseManaString<ManaCost>(payment);
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
            cost: payment,
            submit: (actor, decision) => {
                currentGame.submitResolutionChoice(choice, actor, () => decision === ManaPaymentDecision.Decline
                    || (decision === ManaPaymentDecision.Pay && playerActionManager.payManaCost(cost, player)),
                () => signalResult(decision));
            },
        };
        currentGame.openResolutionChoice(choice);
    }
}
