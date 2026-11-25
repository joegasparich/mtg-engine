import { type CardObject,Permanent } from "@engine/GameObject";
import type { TargetValidator } from "~/defs";

type TargetValidatorConfig = TargetValidator & { targetValidator?: TargetValidator };

export function matchesTargetValidator(target: CardObject, config: TargetValidatorConfig): boolean {
    // Explicit parts can still declare their filters directly.
    const { baseSubtype, cardType, cardSubtype, tapped } = config.targetValidator ?? config;
    return (!cardType || target.type === cardType)
        && (!baseSubtype || target.hasBaseSubtype(baseSubtype))
        && (!cardSubtype || target.subtypes.includes(cardSubtype))
        && (tapped === undefined || (target instanceof Permanent && target.tapped === tapped));
}
