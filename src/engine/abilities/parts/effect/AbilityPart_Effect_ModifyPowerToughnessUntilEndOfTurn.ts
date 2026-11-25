import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ModifyPowerToughnessUntilEndOfTurn extends AbilityPart_Effect {
    recipient: GrammarKey;
    power = 0;
    toughness = 0;

    perform() {
        const recipient = resolveAbilityGrammar(this.recipient, this.ability);
        if (!(recipient instanceof Permanent) || !(recipient.zone instanceof Battlefield))
            return;

        // 611.2a, 611.2c, and 514.2: Fix the recipient at resolution and end the effect during cleanup.
        const end = gameEventManager.effects.startContinuous(this.ability, {
            kind: ContinuousEffectKind.ModifyPowerToughness,
            recipient,
            power: this.power,
            toughness: this.toughness,
        });
        gameEventManager.onGamePerformed(GameEventType.Cleanup, end, { once: true });
    }
}
