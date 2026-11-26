import type { ActionTarget } from "@engine/actions";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { Permanent } from "@engine/GameObject";
import { CardType } from "~/defs";
import { AbilityPart_Target } from "./AbilityPart_Target";

@RegisterAbilityPart
export class AbilityPart_TargetDefendingCreature extends AbilityPart_Target {
    validTargets = [TargetTypeKeys.Permanent];

    protected override canTarget(target: ActionTarget): boolean {
        // 506.2: The defending player is identified before attackers are declared.
        return target instanceof Permanent && target.hasType(CardType.Creature)
            && target.controller === CombatManager.defendingPlayer && super.canTarget(target);
    }
}
