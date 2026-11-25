import type { Ability } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamagePreventionKind } from "@engine/effects/DamagePrevention";
import { type ContinuousEffect,ContinuousEffectKind,type EventCheck } from "@engine/effects/EffectSystem";
import { GameEvent_CheckAttachment,GameEvent_CheckTarget,GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import type { CardColour } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Protection extends AbilityPart_ContinuousEffect {
    colour: CardColour;
    private endDamagePrevention?: () => void;

    override setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source.zone instanceof Battlefield))
            return;

        // 702.16e: Protection prevents damage from sources of the specified colour.
        this.endDamagePrevention = gameEventManager.effects.startContinuous(ability, {
            kind: ContinuousEffectKind.DamagePrevention,
            prevention: {
                kind: DamagePreventionKind.EveryHit,
                matches: hit => hit.recipient === ability.source && hit.source.colours.has(this.colour),
            },
        });
    }

    override cleanup() {
        super.cleanup();
        this.endDamagePrevention?.();
        this.endDamagePrevention = undefined;
    }

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

            // 702.16c: Protection blocks attachments of the specified colour.
            return event instanceof GameEvent_CheckAttachment && event.recipient === source
                && event.attachment.colours.has(this.colour);
        });
    }
}
