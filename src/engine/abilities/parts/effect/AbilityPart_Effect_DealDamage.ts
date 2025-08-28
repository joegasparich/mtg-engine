import {AbilityPart_Effect, GrammarKey, resolveAbilityGrammar} from "@engine/abilities";
import {RegisterAbilityPart} from "@engine/abilities/registry";

@RegisterAbilityPart
class AbilityPart_Effect_DealDamage extends AbilityPart_Effect {
    source: GrammarKey;
    amount: number;
    target: GrammarKey;

    perform() {
        const source = resolveAbilityGrammar(this.source, this.ability);
        const target = resolveAbilityGrammar(this.target, this.ability);

        // gameEventManager.addEvent(new GameEvent_DealDamage(source, target, this.amount));
    }
}