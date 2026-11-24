import { Permanent } from "@engine/GameObject";
import { GameEvent_TapCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

// This is assumed to be FreeTap. Update Ability if this changes
@RegisterAbilityPart
export class AbilityPart_Activate_Tap extends AbilityPart_Activate {
    canActivate(): boolean {
        const { source } = this.ability;
        return source instanceof Permanent && Boolean(source.zone) && !source.tapped;
    }

    payCost(): boolean {
        const { source } = this.ability;
        return source instanceof Permanent && gameEventManager.performImmediate(new GameEvent_TapCard(source));
    }
}
