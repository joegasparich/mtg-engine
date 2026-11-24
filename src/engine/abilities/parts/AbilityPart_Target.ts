import { TargetTypeKeys,type ActionTarget } from "@engine/actions/PlayerActionManager";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { game } from "@engine/Game";
import { CardObject } from "@engine/GameObject";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Target extends AbilityPart {
    saveAs: string;
    validTargets: TargetTypeKeys[];
    count = 1;
    onBattlefield = false;
    targetValidator?: TargetValidator;

    hasLegalTargets(): boolean {
        return this.count === 0
            || game.players.some(player => this.canTarget(player)
                || player.zones.some(zone => zone.objects.some(object => this.canTarget(object))))
            || game.stack.objects.some(object => this.canTarget(object));
    }

    validateTargets(targets: readonly ActionTarget[]): boolean {
        return targets.length === this.count && targets.every(target => this.canTarget(target));
    }

    applyTargets(targets: readonly ActionTarget[]) {
        this.ability.slate[this.saveAs] = targets;
    }

    private canTarget(target: ActionTarget): boolean {
        if (target instanceof Player)
            return this.validTargets.includes(TargetTypeKeys.Player) && game.players.includes(target);

        return this.validTargets.includes(TargetTypeKeys.Card) && target instanceof CardObject && Boolean(target.zone)
            && (!this.onBattlefield || target.zone instanceof Battlefield)
            && matchesTargetValidator(target, this);
    }
}
