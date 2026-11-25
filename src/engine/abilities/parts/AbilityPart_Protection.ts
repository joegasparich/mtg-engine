import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind,type EventCheck } from "@engine/effects/EffectSystem";
import { GameEvent_CheckAttachment,GameEvent_CheckTarget,GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import type { CardColour } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Protection extends AbilityPart_ContinuousEffect {
    colour: CardColour;

    protected getContinuousEffect(): ContinuousEffect {
        return { kind: ContinuousEffectKind.EventCheck, check: check => this.checkProtection(check) };
    }

    private checkProtection(check: EventCheck) {
        const { source } = this.ability;

        check.removeWhere(event => {
            // 702.16b, 702.16f: Restrict targeting and blocker declarations.
            if (event instanceof GameEvent_CheckTarget)
                return event.target === source && event.source.colours.has(this.colour);
            if (event instanceof GameEvent_DeclareBlocker)
                return event.attacker === source && event.blocker.colours.has(this.colour);

            // 702.16e: Prevent damage from sources of the specified colour.
            if (event instanceof GameEvent_DealDamage)
                return event.recipient === source && event.source.colours.has(this.colour);

            // 702.16c: Protection blocks attachments of the specified colour.
            return event instanceof GameEvent_CheckAttachment && event.recipient === source
                && event.attachment.colours.has(this.colour);
        });
    }
}
