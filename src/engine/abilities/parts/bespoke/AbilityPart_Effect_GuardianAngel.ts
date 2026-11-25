import { type GrammarKey,makeAbility,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { game } from "@engine/Game";
import { Permanent,Spell } from "@engine/GameObject";
import Player from "@engine/Player";
import type { AbilityDef } from "~/defs";
import { AbilityPart_Effect } from "../effect/AbilityPart_Effect";

const preventDamageSignal = "PREVENT_DAMAGE";
const paymentCost = "{1}";
const paymentAbility: AbilityDef = {
    parts: {
        AbilityPart_Activate_Mana: { cost: paymentCost, outSignal: preventDamageSignal },
        AbilityPart_Effect_PreventDamage: { target: "RECIPIENT", amount: "SHIELD_AMOUNT", inSignal: preventDamageSignal },
    },
};

@RegisterAbilityPart
export class AbilityPart_Effect_GuardianAngel extends AbilityPart_Effect {
    target: GrammarKey;

    perform() {
        const { source } = this.ability;
        const recipient = resolveAbilityGrammar(this.target, this.ability);
        if (!(source instanceof Spell) || !(recipient instanceof Permanent || recipient instanceof Player))
            return;

        const ability = makeAbility(paymentAbility, source);
        ability.slate.RECIPIENT = [recipient];
        ability.slate.SHIELD_AMOUNT = [source.chosenX];
        ability.fireSignal(preventDamageSignal);

        // 116.2c and 400.7: The caster can pay repeatedly for the original recipient.
        ability.slate.SHIELD_AMOUNT = [1];
        const name = recipient instanceof Player ? `Player ${recipient.id}` : recipient.name;
        game.registerSpecialActionUntilEndOfTurn({
            player: source.controller,
            label: `Pay ${paymentCost} to prevent 1 damage to ${name}`,
            ability,
        });
    }
}
