import Card from "@engine/Card";
import gameEventManager from "@engine/events/GameEventManager";
import {AbilityPart_Activate} from "@engine/abilities";
import {RegisterAbilityPart} from "@engine/abilities/registry";
import {GameEvent_TapCard} from "@engine/events";

@RegisterAbilityPart
class AbilityPart_Activate_Tap extends AbilityPart_Activate {
    canActivate(card: Card): boolean {
        return !card.tapped;
    }

    payCost(card: Card): void {
        gameEventManager.addEvent(new GameEvent_TapCard(card));

        super.payCost(card);
    }
}