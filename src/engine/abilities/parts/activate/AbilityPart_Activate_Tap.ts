import { GameEvent_TapCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

// This is assumed to be FreeTap. Update Ability if this changes
@RegisterAbilityPart
export class AbilityPart_Activate_Tap extends AbilityPart_Activate {
    canActivate(): boolean {
        return !this.ability.card.tapped;
    }

    payCost(): void {
        gameEventManager.addEvent(new GameEvent_TapCard(this.ability.card));
    }
}