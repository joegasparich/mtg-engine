import { type ActionTarget,getTargetTypeKey,TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { getSelectionZones } from "@engine/abilities/ZoneSelection";
import { GameEvent_CheckTarget } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell } from "@engine/GameObject";
import { ZoneKind } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart } from "./AbilityPart";

// 400.2: Hand and library are hidden zones.
export type TargetZone = ZoneKind.Battlefield | ZoneKind.Stack | ZoneKind.Graveyard;

const getTargetTypesByZone: Record<TargetZone, () => readonly TargetTypeKeys[]> = {
    [ZoneKind.Battlefield]: () => [TargetTypeKeys.Permanent],
    [ZoneKind.Stack]: () => [TargetTypeKeys.Spell],
    [ZoneKind.Graveyard]: () => [],
};

@RegisterAbilityPart
export class AbilityPart_Target extends AbilityPart {
    saveAs: string;
    validTargets: TargetTypeKeys[] = [];
    zone?: TargetZone;
    zoneOf?: GrammarKey;
    count = 1;
    targetValidator?: TargetValidator;

    get targetTypes(): readonly TargetTypeKeys[] {
        return this.zone ? getTargetTypesByZone[this.zone]?.() ?? [] : this.validTargets;
    }

    private get targetZones() {
        return Object.hasOwn(getTargetTypesByZone, this.zone)
            ? getSelectionZones(this.ability, { zone: this.zone, zoneOf: this.zoneOf }) : [];
    }

    hasLegalTargets(): boolean {
        if (this.count === 0)
            return true;
        if (this.zone)
            return this.targetZones.some(zone => zone.objects.some(target => this.canTarget(target)));

        return game.players.some(player => this.canTarget(player)
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
        if (this.zone) {
            // 109.2a and 608.2b: A card target must remain in the specified zone.
            if (!(target instanceof CardObject) || !this.targetZones.includes(target.zone))
                return false;
        } else {
            const targetType = getTargetTypeKey(target);
            if (targetType === TargetTypeKeys.None || !this.validTargets.includes(targetType))
                return false;
            if (targetType === TargetTypeKeys.Player)
                return true;
        }

        // 115.5: A spell on the stack can't target itself.
        return target instanceof CardObject && (!(target instanceof Spell) || target !== this.ability.source)
            && matchesTargetValidator(target, this)
            && gameEventManager.checkEvent(new GameEvent_CheckTarget(this.ability.source, target));
    }
}
