import { TargetTypeKeys,type ActionTarget } from "@engine/actions/PlayerActionManager";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent } from "@engine/GameObject";
import { AbilityPart_Target } from "./AbilityPart_Target";

@RegisterAbilityPart
export class AbilityPart_AuraTarget extends AbilityPart_Target {
    validTargets = [TargetTypeKeys.Permanent];

    protected override canTarget(target: ActionTarget): boolean {
        // 303.4a and 702.5a: An Aura spell must be able to enchant its target.
        return target instanceof Permanent && super.canTarget(target) && this.ability.source.canAttachTo(target);
    }
}
