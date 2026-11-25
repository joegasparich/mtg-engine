import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind,type OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_DestroyPermanent,GameEvent_RegeneratePermanent } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_Regenerate extends AbilityPart_Effect {
    recipient: GrammarKey;

    perform(effect: OneShotEffect) {
        const recipient = resolveAbilityGrammar(this.recipient, this.ability);
        if (!(recipient instanceof Permanent) || !(recipient.zone instanceof Battlefield))
            return;

        // 614.8 and 701.19a: Replace the next destruction of this permanent this turn.
        const end = gameEventManager.effects.startContinuous(this.ability, {
            kind: ContinuousEffectKind.EventCheck,
            beforeCommit: true,
            check: check => {
                if (!(recipient.zone instanceof Battlefield))
                    return;

                const destruction = check.events.find(event => event instanceof GameEvent_DestroyPermanent
                    && event.permanent === recipient && event.oldZone === recipient.zone);
                if (!destruction)
                    return;

                const replacement = new GameEvent_RegeneratePermanent(recipient, endShield);
                replacement.effect = effect;
                check.replace(destruction, replacement);
            },
        });
        // 514.2: An unused shield expires during cleanup.
        const cancelCleanup = gameEventManager.onGamePerformed(GameEventType.Cleanup, endShield, { once: true });
        function endShield() {
            cancelCleanup();
            end();
        }
    }
}
