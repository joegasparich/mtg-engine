import { Permanent } from "@engine/GameObject";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type CheckSource,type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareAttacker } from "@engine/events/GameEvent_CardInteractionChecks";
import type { GameEvent } from "@engine/events/GameEventManager";
import { Keyword } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_AttachedCreatureAttacksWithDefender extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        return { kind: ContinuousEffectKind.CheckOverride, allow: (event, source) => this.allowAttack(event, source) };
    }

    private allowAttack(event: GameEvent, source: CheckSource) {
        // 609.4: Treat the creature as though it lacked defender for this declaration only.
        return source.keyword === Keyword.Defender
            && event instanceof GameEvent_DeclareAttacker
            && event.attacker === source.object
            && this.ability.source instanceof Permanent
            && event.attacker === this.ability.source.attachedTo;
    }
}
