import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_SelectPlayers extends AbilityPart_Effect {
    target?: GrammarKey;
    saveAs: string;
    outSignal?: string;

    perform() {
        const { ability } = this;
        if (this.target === undefined) {
            ability.slate[this.saveAs] = [...game.players];
        } else {
            const player = resolveAbilityGrammar(this.target, ability);
            ability.slate[this.saveAs] = player instanceof Player ? [player] : [];
        }
        if (this.outSignal)
            ability.fireSignal(this.outSignal);
    }
}
