import { Permanent } from "@engine/GameObject";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import gameEventManager,{ type CheckSource,type GameEvent,GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import { Keyword } from "~/defs";
import type { Ability } from "../Ability";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_AttachedCreatureAttacksWithDefender extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (ability.source.zone instanceof Battlefield)
            gameEventManager.onCheckRemovalOverride(this.allowAttack);
    }

    cleanup(ability: Ability) {
        if (ability.source.zone instanceof Battlefield)
            gameEventManager.offCheckRemovalOverride(this.allowAttack);
    }

    @autobind
    private allowAttack(event: GameEvent, source: CheckSource) {
        // 609.4: Treat the creature as though it lacked defender for this declaration only.
        return source.keyword === Keyword.Defender
            && event instanceof GameEvent_Simple
            && event.type === GameEventType.DeclareAttacker
            && event.objectA === source.object
            && this.ability.source instanceof Permanent
            && event.objectA === this.ability.source.attachedTo;
    }
}
