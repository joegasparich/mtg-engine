import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent } from "@engine/GameObject";
import gameEventManager,{ type EventCheck,GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import { Keyword } from "~/defs";
import { Ability } from "../Ability";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
class AbilityPart_Flying extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (!(ability.source.zone instanceof Battlefield))
            return;

        gameEventManager.onCheck(this.checkForEffects);
    }

    cleanup(ability: Ability) {
        if (!(ability.source.zone instanceof Battlefield))
            return;

        gameEventManager.offCheck(this.checkForEffects);
    }

    @autobind
    checkForEffects(check: EventCheck) {
        check.removeWhere(event => {
            if (event.type != GameEventType.DeclareBlocker)
                return false;

            const blockerEvent = event as GameEvent_Simple;

            if (blockerEvent.objectB !== this.ability.source)
                return false;

            return blockerEvent.objectA instanceof Permanent && !this.canBlockFlying(blockerEvent.objectA);
        });
    }

    canBlockFlying(blocker: Permanent) {
        if (blocker.hasKeyword(Keyword.Flying))
            return true;

        if (blocker.hasKeyword(Keyword.Reach))
            return true;

        return false;
    }
}
