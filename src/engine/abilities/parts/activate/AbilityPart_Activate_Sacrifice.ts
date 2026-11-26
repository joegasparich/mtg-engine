import { RegisterAbilityPart } from "@engine/abilities/registry";
import { GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

@RegisterAbilityPart
export class AbilityPart_Activate_Sacrifice extends AbilityPart_Activate {
    private sacrificeEvent() {
        const { source, activator } = this.ability;
        // 701.21a: A player can sacrifice only a permanent they control.
        if (source instanceof Permanent && source.zone instanceof Battlefield && source.controller === activator)
            return new GameEvent_SacrificePermanent(activator, source);
    }

    canActivate(): boolean {
        const event = this.sacrificeEvent();
        return !!event && gameEventManager.checkEvent(event);
    }

    payCost(): boolean {
        const event = this.sacrificeEvent();
        return !!event && gameEventManager.performImmediate(event);
    }
}
