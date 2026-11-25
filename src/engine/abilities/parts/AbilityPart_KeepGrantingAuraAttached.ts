import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckAttachment } from "@engine/events/GameEvent_CardInteractionChecks";
import { Permanent } from "@engine/GameObject";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_KeepGrantingAuraAttached extends AbilityPart_ContinuousEffect {
    grantFrom: string;

    protected getContinuousEffect(): ContinuousEffect {
        const { source, slate } = this.ability;
        return {
            kind: ContinuousEffectKind.CheckOverride,
            // 702.16n: Exempt this Aura's existing attachment from only the specified grant.
            allow: (event, checkSource) => event instanceof GameEvent_CheckAttachment
                && source instanceof Permanent && source.subtypes.includes("Aura")
                && event.attachment === source && event.recipient === source.attachedTo
                && Boolean(checkSource.ability) && checkSource.ability === slate[this.grantFrom],
        };
    }
}
