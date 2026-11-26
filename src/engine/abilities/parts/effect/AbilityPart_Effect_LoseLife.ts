import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

export enum LifeLossAmount {
    HalfRoundedUp = "HalfRoundedUp",
}

@RegisterAbilityPart
export class AbilityPart_Effect_LoseLife extends AbilityPart_Effect {
    target: GrammarKey;
    amount: number | LifeLossAmount;

    perform() {
        const player = resolveAbilityGrammar(this.target, this.ability);
        if (!(player instanceof Player))
            return;

        const amount = this.amount === LifeLossAmount.HalfRoundedUp ? Math.ceil(player.life / 2) : this.amount;
        // 107.1b and 119.3: Losing life reduces the life total by a nonnegative amount.
        if (Number.isSafeInteger(amount) && amount > 0)
            player.life -= amount;
    }
}
