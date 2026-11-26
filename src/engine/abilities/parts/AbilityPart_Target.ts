import { type ActionTarget,getTargetTypeKey,TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { GameEvent_CheckTarget } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject } from "@engine/GameObject";
import type { TargetValidator } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Target extends AbilityPart {
    saveAs: string;
    validTargets: TargetTypeKeys[];
    count = 1;
    targetValidator?: TargetValidator;

    hasLegalTargets(): boolean {
        return this.count === 0
            || game.players.some(player => this.canTarget(player)
                || player.battlefield.objects.some(object => this.canTarget(object)))
            || game.stack.objects.some(object => this.canTarget(object));
    }

    validateTargets(targets: readonly ActionTarget[]): boolean {
        return targets.length === this.count && targets.every(target => this.canTarget(target));
    }

    applyTargets(targets: readonly ActionTarget[]) {
        this.ability.slate[this.saveAs] = targets;
    }

    protected canTarget(target: ActionTarget): boolean {
        const targetType = getTargetTypeKey(target);
        if (targetType === TargetTypeKeys.None || !this.validTargets.includes(targetType))
            return false;
        if (targetType === TargetTypeKeys.Player)
            return true;

        // 115.5: A spell on the stack can't target itself.
        return target instanceof CardObject && (targetType !== TargetTypeKeys.Spell || target !== this.ability.source)
            && matchesTargetValidator(target, this)
            && gameEventManager.checkEvent(new GameEvent_CheckTarget(this.ability.source, target));
    }
}
