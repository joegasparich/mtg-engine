import { RegisterAbilityPart } from "@engine/abilities/registry";
import { game } from "@engine/Game";
import { StepIndex } from "@engine/Step";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_CastDuringSteps extends AbilityPart {
    steps: (keyof typeof StepIndex)[];
    opponentsTurnOnly = false;

    canCast(): boolean {
        if (this.opponentsTurnOnly && game.currentTurnPlayer() === this.ability.source.owner) return false;
        return this.steps.some(step => StepIndex[step] === game.currentStepIndex);
    }
}
