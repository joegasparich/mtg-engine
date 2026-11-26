import { game } from "@engine/Game";
import type { Ability } from "../../Ability";
import { AbilityPart } from "../AbilityPart";

export abstract class AbilityPart_Trigger extends AbilityPart {
    outSignal = "default";

    onTrigger(inputs: Ability["slate"] = {}, controller = this.ability.source.controller) {
        if (!controller)
            return;

        // 603.3: Capture the trigger now and put it on the stack after state-based actions.
        game.stack.abilityTriggered(controller, this.ability, this.outSignal, inputs);
    }
}
