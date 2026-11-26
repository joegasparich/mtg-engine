import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import type { Ability } from "@engine/abilities/Ability";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { game } from "@engine/Game";
import { CardObject,type GameObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { Battlefield,type Zone,ZoneKind } from "@engine/Zone";
import type { TargetValidator } from "~/defs";

export type ZoneSelection = {
    zone: ZoneKind;
    // Scope the zone lookup to a player. Omit this to scan every player's zone of this kind.
    zoneOf?: GrammarKey;
    // Filter each object's controller independently of where the engine stores it.
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
};

export function selectObjectsFromZone(ability: Ability, selection: ZoneSelection): GameObject[] {
    const { controlledBy, targetValidator } = selection;
    const controller = controlledBy ? resolveAbilityGrammar(controlledBy, ability) : undefined;
    if (controlledBy && !(controller instanceof Player))
        return [];

    return getSelectionZones(ability, selection).flatMap(zone => zone.objects.filter(object =>
        (!controller || ("controller" in object && object.controller === controller))
        && (!targetValidator || (object instanceof CardObject && matchesTargetValidator(object, targetValidator)))));
}

export function getBattlefieldPermanentsFromSlate(ability: Ability, key: GrammarKey): readonly Permanent[] {
    const objects: readonly GameObject[] = ability.slate[key] ?? [];
    return objects.filter((object): object is Permanent => object instanceof Permanent && object.zone instanceof Battlefield);
}

function getSelectionZones(ability: Ability, { zone, zoneOf }: ZoneSelection): readonly Zone[] {
    // 400.1: The stack is shared. The engine stores the shared battlefield in player partitions.
    if (zone === ZoneKind.Stack)
        return [game.stack];

    if (!zoneOf)
        return game.players.map(player => player[zone]);

    const player = resolveAbilityGrammar(zoneOf, ability);
    return player instanceof Player && game.players.includes(player) ? [player[zone]] : [];
}
