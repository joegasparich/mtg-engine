import { RegisterAbilityPart } from "@engine/abilities/registry";
import gameEventManager,{ type EventCheck,GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import { Ability } from "../Ability";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Defender extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (ability.source.zone instanceof Battlefield)
            gameEventManager.onCheck(this.checkForEffects);
    }

    cleanup(ability: Ability) {
        if (ability.source.zone instanceof Battlefield)
            gameEventManager.offCheck(this.checkForEffects);
    }

    @autobind
    private checkForEffects(check: EventCheck) {
        // 702.3b: A creature with defender cannot attack.
        check.removeWhere(event => event instanceof GameEvent_Simple
            && event.type === GameEventType.DeclareAttacker
            && event.objectA === this.ability.source);
    }
}
