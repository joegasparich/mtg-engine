import { resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { AbilityDef } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_GrantAbilityUntilEndOfTurn extends AbilityPart_Effect {
    target: string;
    grant: AbilityDef;

    perform() {
        const recipient = resolveAbilityGrammar(this.target, this.ability);
        if (recipient instanceof Permanent && recipient.zone instanceof Battlefield) {
            // 611.2a and 514.2: A spell's temporary effect ends during cleanup.
            const revoke = gameEventManager.effects.startContinuous(this.ability, {
                kind: ContinuousEffectKind.AbilityGrant,
                recipients: [recipient],
                grant: this.grant,
            });
            gameEventManager.onGamePerformed(GameEventType.Cleanup, revoke, { once: true });
        }
    }
}
