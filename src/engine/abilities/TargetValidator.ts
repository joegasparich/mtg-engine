import { CombatManager } from "@engine/CombatManager";
import { type CardObject,Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";

type TargetValidatorConfig = TargetValidator & { targetValidator?: TargetValidator };

export function matchesTargetValidator(target: CardObject, config: TargetValidatorConfig): boolean {
    // Explicit parts can still declare their filters directly.
    const { baseSubtype, blocking, cardType, cardTypes, cardSubtype, colour, onBattlefield, tapped } = config.targetValidator ?? config;
    // 105.2: An object can match any of its current colours.
    return (!onBattlefield || target.zone instanceof Battlefield)
        && (!cardType || target.type === cardType)
        && (!cardTypes || cardTypes.includes(target.type))
        && (!colour || target.colours.has(colour))
        && (!baseSubtype || target.hasBaseSubtype(baseSubtype))
        && (!cardSubtype || target.subtypes.includes(cardSubtype))
        && (tapped === undefined || (target instanceof Permanent && target.tapped === tapped))
        && (blocking === undefined || (target instanceof Permanent && CombatManager.isBlocking(target) === blocking));
}
