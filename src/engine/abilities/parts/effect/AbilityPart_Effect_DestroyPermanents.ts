import type { ActionTarget } from "@engine/actions";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { GameEvent_DestroyPermanent } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_DestroyPermanents extends AbilityPart_Effect {
    permanentsFrom: string;

    perform() {
        const objects: readonly ActionTarget[] = this.ability.slate[this.permanentsFrom] ?? [];
        const events = objects
            .filter((object): object is Permanent => object instanceof Permanent && object.zone instanceof Battlefield)
            .map(permanent => new GameEvent_DestroyPermanent(permanent));

        // 608.2f and 701.8a: Destroy the permanents simultaneously into their owners' graveyards.
        if (events.length)
            gameEventManager.performSimultaneous(events);
    }
}
