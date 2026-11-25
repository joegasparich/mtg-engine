import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckAttachment } from "@engine/events/GameEvent_CardInteractionChecks";
import { Permanent } from "@engine/GameObject";
import { AttachmentSubtype } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_PreventOtherAurasOnAttachment extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect | undefined {
        const { source } = this.ability;
        if (!(source instanceof Permanent))
            return;

        // 303.4c and 704.5m: Existing Auras with illegal attachments also go to the graveyard.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_CheckAttachment
                && event.recipient === source.attachedTo && event.attachment !== source
                && event.attachment.subtypes.includes(AttachmentSubtype.Aura)),
        };
    }
}
