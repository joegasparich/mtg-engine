import { type CardObject,Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";

type TargetValidatorConfig = TargetValidator & { targetValidator?: TargetValidator };

export function matchesTargetValidator(target: CardObject, config: TargetValidatorConfig): boolean {
    // Explicit parts can still declare their filters directly.
    const { baseSubtype, cardType, cardTypes, cardSubtype, onBattlefield, tapped } = config.targetValidator ?? config;
    // 109.2: An unqualified card type in rules text refers to a battlefield permanent.
    return (!onBattlefield || target.zone instanceof Battlefield)
        && (!cardType || target.type === cardType)
        && (!cardTypes || cardTypes.includes(target.type))
        && (!baseSubtype || target.hasBaseSubtype(baseSubtype))
        && (!cardSubtype || target.subtypes.includes(cardSubtype))
        && (tapped === undefined || (target instanceof Permanent && target.tapped === tapped));
}
