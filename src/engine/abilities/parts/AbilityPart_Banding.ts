import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { GameEvent_CheckCombatDamageChooser } from "@engine/events/GameEvent_CombatDamageChoice";
import gameEventManager,{ type EventCheck } from "@engine/events/GameEventManager";
import type { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import { Keyword } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Banding extends AbilityPart {
    // 702.22c: Every band has a creature with banding and at most one without it.
    static allowsBand(members: ReadonlySet<Permanent>): boolean {
        const withBanding = [...members].filter(member => member.hasKeyword(Keyword.Banding)).length;
        return withBanding > 0 && members.size - withBanding <= 1;
    }

    setup(ability: Ability) {
        super.setup(ability);

        if (ability.source.zone instanceof Battlefield)
            gameEventManager.onCheck(this.chooseDamage);
    }

    cleanup() {
        gameEventManager.offCheck(this.chooseDamage);
    }

    @autobind
    private chooseDamage(check: EventCheck) {
        const creature = this.ability.source;
        if (!creature.hasKeyword(Keyword.Banding))
            return;

        // 702.22j–k: Check the current ability of each opposing combatant at assignment time.
        for (const event of check.events) {
            if (event instanceof GameEvent_CheckCombatDamageChooser && event.recipients.some(recipient => recipient === creature))
                event.player = creature.controller;
        }
    }
}
