import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { GameEvent_StepStart } from "@engine/events/GameEvent_Step";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { StepIndex } from "@engine/Step";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_StepStart extends AbilityPart_Trigger {
    step: keyof typeof StepIndex;
    controllerOnly = false;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source.zone instanceof Battlefield))
            return;

        // 603.2b, 503.1a: Step-start triggers go on the stack before the first priority pass.
        this.stopListening ??= gameEventManager.onGamePerformed(GameEventType.StepStart, (event: GameEvent_StepStart) => {
            if (event.stepIndex === StepIndex[this.step] && (!this.controllerOnly || event.player === ability.source.controller))
                this.onTrigger();
        });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }
}
