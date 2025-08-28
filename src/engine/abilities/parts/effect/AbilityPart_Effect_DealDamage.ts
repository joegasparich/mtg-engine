import {GrammarKey, resolveAbilityGrammar} from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

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