import playerActionManager,{ type ActionTarget,getTargetTypeKey,TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { getSelectionZones } from "@engine/abilities/ZoneSelection";
import { GameEvent_CheckTarget } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell } from "@engine/GameObject";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
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
    controlledBy?: GrammarKey;
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
        const source = this.ability.source;
        const needsX = source.chosenX === undefined && source.zone === source.owner.hand && source.variableManaSymbols > 0
            && typeof this.targetValidator?.manaValueEquals === "string";
        const maxX = needsX ? playerActionManager.maxAffordableX(source, source.owner) : undefined;
        const canChoose = (target: ActionTarget) => {
            if (maxX === undefined)
                return this.canTarget(target);
            if (!(target instanceof CardObject))
                return false;
            // 601.2b–c: For each candidate, try the only X that could make it legal.
            const x = ManaUtility.getManaValue(target.cost);
            return x <= maxX && source.withCastingX(x, () => this.canTarget(target));
        };
        if (this.zone)
            return this.targetZones.some(zone => zone.objects.some(canChoose));

        return game.players.some(player => canChoose(player) || player.battlefield.objects.some(canChoose))
            || game.stack.objects.some(canChoose);
    }

    validateTargets(targets: readonly ActionTarget[]): boolean {
        return targets.length === this.count && targets.every(target => this.canTarget(target));
    }

    applyTargets(targets: readonly ActionTarget[]) {
        this.ability.slate[this.saveAs] = targets;
    }

    protected canTarget(target: ActionTarget): boolean {
        if (this.controlledBy) {
            const controller = resolveAbilityGrammar(this.controlledBy, this.ability);
            if (!controller || !(target instanceof CardObject) || target.controller !== controller)
                return false;
        }
        if (this.zone) {
            // 109.2a and 608.2b: A card target must remain in the specified zone.
            if (!(target instanceof CardObject) || !this.targetZones.includes(target.zone))
                return false;
        } else {
            const targetType = getTargetTypeKey(target);
            if (targetType === TargetTypeKeys.None || !this.validTargets.includes(targetType))
                return false;
            if (target instanceof Player)
                return matchesTargetValidator(target, this);
        }

        // 115.5: A spell on the stack can't target itself.
        return target instanceof CardObject && (!(target instanceof Spell) || target !== this.ability.source)
            && matchesTargetValidator(target, this)
            && gameEventManager.checkEvent(new GameEvent_CheckTarget(this.ability.source, target));
    }
}
