import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind,type EventCheck } from "@engine/effects/EffectSystem";
import { GameEvent_CheckCombatDamageChooser } from "@engine/events/GameEvent_CombatDamageChoice";
import type { Permanent } from "@engine/GameObject";
import { Keyword } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Banding extends AbilityPart_ContinuousEffect {
    // 702.22c: Every band has a creature with banding and at most one without it.
    static allowsBand(members: ReadonlySet<Permanent>): boolean {
        const withBanding = [...members].filter(member => member.hasKeyword(Keyword.Banding)).length;
        return withBanding > 0 && members.size - withBanding <= 1;
    }

    protected getContinuousEffect(): ContinuousEffect {
        return { kind: ContinuousEffectKind.EventCheck, check: check => this.chooseDamage(check) };
    }

    private chooseDamage(check: EventCheck) {
        const creature = this.ability.source;
        // 702.22j–k: Check the current ability of each opposing combatant at assignment time.
        for (const event of check.events) {
            if (event instanceof GameEvent_CheckCombatDamageChooser
                && event.recipients.some(recipient => recipient === creature) && creature.hasKeyword(Keyword.Banding))
                event.player = creature.controller;
        }
    }
}
