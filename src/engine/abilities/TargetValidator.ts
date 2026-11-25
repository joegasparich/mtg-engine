import { type CardObject,Permanent } from "@engine/GameObject";
import type { TargetValidator } from "~/defs";

type TargetValidatorConfig = TargetValidator & { targetValidator?: TargetValidator };

export function matchesTargetValidator(target: CardObject, config: TargetValidatorConfig): boolean {
    // Explicit parts can still declare their filters directly.
    const { cardType, cardSubtype, tapped } = config.targetValidator ?? config;
    return (!cardType || target.type === cardType)
        && (!cardSubtype || target.subtypes.includes(cardSubtype))
        && (tapped === undefined || (target instanceof Permanent && target.tapped === tapped));
}
