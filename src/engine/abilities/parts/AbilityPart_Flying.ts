import {RegisterAbilityPart} from "@engine/abilities/registry";
import {autobind} from "@utility/typeUtility";
import {Keyword} from "~/defs";
import {Battlefield} from "@engine/Zone";
import Card from "@engine/Card";
import {removeIf} from "@utility/arrayUtility";
import {AbilityPart} from "./AbilityPart";
import {Ability} from "../Ability";
import gameEventManager, {GameEvent, GameEvent_Simple, GameEventType} from "@engine/events/GameEventManager";

@RegisterAbilityPart
class AbilityPart_Flying extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (!(ability.card.zone instanceof Battlefield))
            return;

        gameEventManager.onCheck(this.checkForEffects);
    }

    cleanup(ability: Ability) {
        if (!(ability.card.zone instanceof Battlefield))
            return;

        gameEventManager.offCheck(this.checkForEffects);
    }

    @autobind
    checkForEffects(events: GameEvent[]) {
        removeIf(events, (event) => {
            if (event.type != GameEventType.DeclareBlocker)
                return false;

            const blockerEvent = event as GameEvent_Simple;

            if (blockerEvent.cardB !== this.ability.card)
                return false;

            return !this.canBlockFlying(blockerEvent.cardA);
        });
    }

    canBlockFlying(blocker: Card) {
        if (blocker.hasKeyword(Keyword.Flying))
            return true;

        if (blocker.hasKeyword(Keyword.Reach))
            return true;

        return false;
    }
}