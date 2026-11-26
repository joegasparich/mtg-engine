import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Battlefield,Graveyard } from "@engine/Zone";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_Dies extends AbilityPart_Trigger {
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source } = ability;
        if (!(source.zone instanceof Battlefield))
            return;

        // 603.10a, 700.4, and 113.8: The ability and controller come from before the move to the graveyard.
        this.stopListening ??= gameEventManager.onGamePerformed(GameEventType.ChangeCardZone,
            (_event: GameEvent_ChangeCardZone, controller) => {
                if (controller)
                    this.onTrigger({}, controller);
            }, {
                matches: event => event.oldObject === source && event.oldZone instanceof Battlefield
                    && event.newZone instanceof Graveyard,
                captureBeforeBatch: () => source.controller,
            });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }
}
