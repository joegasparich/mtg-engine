import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { type ManaAmountPaymentChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_PayAnyMana extends AbilityPart_Effect {
    player: GrammarKey;
    saveAs: string;
    outSignal?: string;

    perform() {
        const player = resolveAbilityGrammar(this.player, this.ability);
        if (!(player instanceof Player))
            return;

        const finish = (paid: number) => {
            this.ability.slate[this.saveAs] = [paid];
            if (this.outSignal)
                this.ability.fireSignal(this.outSignal);
        };

        // CR 608.2g: Include mana abilities available during the payment.
        const max = game.infiniteMana ? Number.MAX_SAFE_INTEGER
            : ManaUtility.asGeneric(player.manaPool) + ManaUtility.asGeneric(player.getPotentialMana());
        if (max === 0) {
            finish(0);
            return;
        }

        const currentGame = game;
        const choice: ManaAmountPaymentChoice = {
            kind: ResolutionChoiceKind.ManaAmountPayment, player, max,
            sourceName: this.ability.source.name,
            submit: (actor, amount) => currentGame.submitResolutionChoice(choice, actor,
                () => Number.isSafeInteger(amount) && amount >= 0 && amount <= max
                    && playerActionManager.payManaCost([0, 0, 0, 0, 0, 0, amount], player),
                () => finish(amount)),
        };
        currentGame.openResolutionChoice(choice);
    }
}
