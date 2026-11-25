import { RegisterAbilityPart } from "@engine/abilities/registry";
import { game } from "@engine/Game";
import { StepIndex } from "@engine/Step";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_CastDuringSteps extends AbilityPart {
    steps: (keyof typeof StepIndex)[];

    canCast(): boolean {
        return this.steps.some(step => StepIndex[step] === game.currentStepIndex);
    }
}
