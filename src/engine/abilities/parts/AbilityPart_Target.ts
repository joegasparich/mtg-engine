import { TargetTypeKeys,type ActionTarget } from "@engine/actions/PlayerActionManager";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Target extends AbilityPart {
    saveAs: string;
    validTargets: TargetTypeKeys[];
    count = 1;

    validateTargets(targets: readonly ActionTarget[]): boolean {
        return targets.length === this.count && targets.every(target => {
            if (target instanceof Player)
                return this.validTargets.includes(TargetTypeKeys.Player) && game.players.includes(target);

            return this.validTargets.includes(TargetTypeKeys.Card) && Boolean(target?.zone);
        });
    }

    applyTargets(targets: readonly ActionTarget[]) {
        this.ability.slate[this.saveAs] = targets;
    }
}
