import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import type { Ability } from "@engine/abilities/Ability";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { game } from "@engine/Game";
import { CardObject,GameObject,Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { type Zone,ZoneKind } from "@engine/Zone";
import type { TargetValidator } from "~/defs";

export type ZoneSelection = {
    zone: ZoneKind;
    // Scope the zone lookup to a player. Omit this to scan every player's zone of this kind.
    zoneOf?: GrammarKey;
    // Filter each object's controller independently of where the engine stores it.
    controlledBy?: GrammarKey;
    targetValidator?: TargetValidator;
    excludeSource?: boolean;
};

// Card definitions specify either a grammar reference (e.g. THIS.attachedTo) or a zone.
export type ObjectSelection = Partial<ZoneSelection> & { target?: GrammarKey };

export function selectObjects(ability: Ability, selection: ObjectSelection) {
    const { target, zone, zoneOf, controlledBy, targetValidator, excludeSource } = selection;
    if ((target === undefined) === (zone === undefined))
        throw new Error("An object selector requires exactly one of 'target' and 'zone'");
    if (zone !== undefined)
        return selectObjectsFromZone(ability, { zone, zoneOf, controlledBy, targetValidator, excludeSource });

    const object = resolveAbilityGrammar(target, ability);
    if (!object || (excludeSource && object === ability.source)
        || (targetValidator && !(object instanceof CardObject && matchesTargetValidator(object, targetValidator))))
        return [];
    return [object];
}

export function selectObjectsFromZone(ability: Ability, selection: ZoneSelection): GameObject[] {
    const { controlledBy, targetValidator } = selection;
    const controller = controlledBy ? resolveAbilityGrammar(controlledBy, ability) : undefined;
    if (controlledBy && !(controller instanceof Player))
        return [];

    // During layer 2 the controller can already have changed while the physical partition
    // still belongs to the previous controller. Both partitions are the same battlefield.
    const battlefieldScope = selection.zone === ZoneKind.Battlefield && selection.zoneOf;
    const scope = battlefieldScope ? resolveAbilityGrammar(battlefieldScope, ability) : undefined;
    const zones = battlefieldScope ? game.players.map(player => player.battlefield) : getSelectionZones(ability, selection);
    return zones.flatMap(zone => zone.objects.filter(object =>
        (!selection.excludeSource || object !== ability.source)
        && (!battlefieldScope || (object instanceof Permanent && object.controller === scope))
        && (!controller || ("controller" in object && object.controller === controller))
        && (!targetValidator || (object instanceof CardObject && matchesTargetValidator(object, targetValidator)))));
}

type ZoneClass = abstract new () => Zone;
type ObjectInZone<T extends ZoneClass> = InstanceType<T>["objects"][number];

export function getObjectsFromSlateInZones<T extends readonly ZoneClass[]>(ability: Ability, key: GrammarKey,
    ...zoneTypes: T): readonly ObjectInZone<T[number]>[] {
    // During a layer pass a static ability may exist before its event listeners are installed.
    const objects: readonly unknown[] = ability.parts.map(part => part.continuousSelection?.(key))
        .find(selection => selection !== undefined) ?? ability.slate[key] ?? [];
    return objects.filter((object): object is ObjectInZone<T[number]> =>
        object instanceof GameObject && zoneTypes.some(zoneType => object.zone instanceof zoneType));
}

export function getSelectionZones(ability: Ability, { zone, zoneOf }: ZoneSelection): readonly Zone[] {
    // 400.1: Exile and the stack are shared. The battlefield is stored in player partitions.
    if (zone === ZoneKind.Stack || zone === ZoneKind.Exile)
        return [game[zone]];

    if (!zoneOf)
        return game.players.map(player => player[zone]);

    const player = resolveAbilityGrammar(zoneOf, ability);
    return player instanceof Player && game.players.includes(player) ? [player[zone]] : [];
}
