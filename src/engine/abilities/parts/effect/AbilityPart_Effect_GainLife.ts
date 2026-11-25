import Player from "@engine/Player";
import { type GrammarKey,resolveAbilityGrammar } from "../../index";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_GainLife extends AbilityPart_Effect {
    amount: number;
    target: GrammarKey;

    perform() {
        const player = resolveAbilityGrammar(this.target, this.ability);

        // 119.3: Increase the affected player's life total by the amount gained.
        if (player instanceof Player && Number.isInteger(this.amount) && this.amount > 0)
            player.life += this.amount;
    }
}
