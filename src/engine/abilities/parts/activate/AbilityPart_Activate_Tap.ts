import Card from "@engine/Card";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_TapCard} from "@engine/events";
import { AbilityPart_Activate } from "./AbilityPart_Activate";
import { RegisterAbilityPart } from "../../registry";

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