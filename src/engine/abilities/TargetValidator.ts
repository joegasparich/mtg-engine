import { CombatManager } from "@engine/CombatManager";
import { CardObject,Permanent } from "@engine/GameObject";
import { ManaUtility } from "@engine/mana";
import type Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";

type TargetValidatorConfig = TargetValidator & { targetValidator?: TargetValidator };

export function matchesTargetValidator(target: CardObject | Player, config: TargetValidatorConfig): boolean {
    // Explicit parts can still declare their filters directly.
    const { attackedThisTurn, baseSubtype, blocking, cardType, cardTypes, cardSubtype, colour, controlledSinceTurnStart,
        excludedSubtype, hasManaAbility, manaValueEquals, onBattlefield, tapped, unblocked } = config.targetValidator ?? config;
    if (!(target instanceof CardObject))
        return manaValueEquals === undefined;
    // 105.2: An object can match any of its current colours.
    return (!onBattlefield || target.zone instanceof Battlefield)
        // 202.3e: A spell's stack cost includes its own announced X.
        && (manaValueEquals === undefined || ManaUtility.getManaValue(target.cost) === manaValueEquals)
        && (!cardType || target.hasType(cardType))
        && (!cardTypes || cardTypes.some(type => target.hasType(type)))
        && (!colour || target.colours.has(colour))
        && (!baseSubtype || target.hasBaseSubtype(baseSubtype))
        && (!excludedSubtype || !target.subtypes.includes(excludedSubtype))
        && (attackedThisTurn === undefined || (target instanceof Permanent && target.attackedThisTurn === attackedThisTurn))
        && (controlledSinceTurnStart === undefined || (target instanceof Permanent && target.controlledSinceTurnStart === controlledSinceTurnStart))
        && (!cardSubtype || target.subtypes.includes(cardSubtype))
        && (hasManaAbility === undefined || target.abilities.some(ability => ability.def.isManaAbility) === hasManaAbility)
        && (tapped === undefined || (target instanceof Permanent && target.tapped === tapped))
        && (blocking === undefined || (target instanceof Permanent && CombatManager.isBlocking(target) === blocking))
        && (unblocked === undefined || (target instanceof Permanent && CombatManager.isUnblocked(target) === unblocked));
}
