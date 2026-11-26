import { Permanent } from "@engine/GameObject";
import { GameEvent_TapCard } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

@RegisterAbilityPart
export class AbilityPart_Activate_Tap extends AbilityPart_Activate {
    canActivate(): boolean {
        const { source } = this.ability;
        return source instanceof Permanent && source.canPayTapCost
            && gameEventManager.checkEvent(new GameEvent_TapCard(source));
    }

    payCost(): boolean {
        const { source } = this.ability;
        return source instanceof Permanent && source.canPayTapCost
            && gameEventManager.performImmediate(new GameEvent_TapCard(source));
    }
}
