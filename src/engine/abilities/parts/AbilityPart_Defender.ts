import { RegisterAbilityPart } from "@engine/abilities/registry";
import gameEventManager,{ GameEvent,GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { removeIf } from "@utility/arrayUtility";
import { autobind } from "@utility/typeUtility";
import { Ability } from "../Ability";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Defender extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (ability.card.zone instanceof Battlefield)
            gameEventManager.onCheck(this.checkForEffects);
    }

    cleanup(ability: Ability) {
        if (ability.card.zone instanceof Battlefield)
            gameEventManager.offCheck(this.checkForEffects);
    }

    @autobind
    private checkForEffects(events: GameEvent[]) {
        // 702.3b: A creature with defender cannot attack.
        removeIf(events, event => event instanceof GameEvent_Simple
            && event.type === GameEventType.DeclareAttacker
            && event.cardA === this.ability.card);
    }
}
