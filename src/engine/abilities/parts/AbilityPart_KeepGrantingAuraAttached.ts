import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckAttachment } from "@engine/events/GameEvent_CardInteractionChecks";
import { Permanent } from "@engine/GameObject";
import { AttachmentSubtype } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_KeepGrantingAuraAttached extends AbilityPart_ContinuousEffect {
    grantsFrom: string;

    protected getContinuousEffect(): ContinuousEffect {
        const { source, slate } = this.ability;
        return {
            kind: ContinuousEffectKind.CheckOverride,
            // 702.16n: Exempt this Aura's current attachment from only the specified grants.
            allow: (event, checkSource) => {
                const grants: readonly Ability[] | undefined = slate[this.grantsFrom];
                return event instanceof GameEvent_CheckAttachment && source instanceof Permanent
                    && event.attachment === source && event.recipient === source.attachedTo
                    && source.subtypes.includes(AttachmentSubtype.Aura)
                    && checkSource.ability !== undefined && (grants?.includes(checkSource.ability) ?? false);
            },
        };
    }
}
