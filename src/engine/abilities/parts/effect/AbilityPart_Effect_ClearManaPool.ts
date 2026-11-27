import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_LoseMana } from "@engine/events/GameEvent_LoseMana";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ClearManaPool extends AbilityPart_Effect {
    target: GrammarKey;
    saveAs?: string;
    outSignal?: string;

    perform(effect: OneShotEffect) {
        const { ability } = this;
        const player = resolveAbilityGrammar(this.target, ability);
        if (!(player instanceof Player))
            return;

        const loss = new GameEvent_LoseMana(player);
        effect.emit(loss);
        if (this.saveAs || this.outSignal) {
            effect.continueResolution(() => {
                if (this.saveAs)
                    ability.slate[this.saveAs] = loss.mana ? [loss.mana] : [];
                if (this.outSignal)
                    ability.fireSignal(this.outSignal);
            });
        }
    }
}
