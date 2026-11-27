import { RulesEventType } from "@engine/events/RulesEvent";
import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { Permanent } from "@engine/GameObject";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import gameEventManager from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import type { Ability } from "../Ability";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Attach extends AbilityPart_Effect {
    target: GrammarKey;
    saveAs?: string;
    targetValidator?: TargetValidator;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source } = ability;
        if (!(source instanceof Permanent && source.zone instanceof Battlefield))
            return;

        // 701.3d: The attachment ends when the object changes zones.
        this.stopListening ??= gameEventManager.rules.on(RulesEventType.ZoneChanged,
            () => { source.attachedTo = undefined; }, { matches: event => event.oldObject === source.attachedTo });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }

    perform(effect: OneShotEffect) {
        const { source } = this.ability;
        const target = resolveAbilityGrammar(this.target, this.ability);
        if (this.saveAs) {
            this.ability.slate[this.saveAs] = target instanceof Permanent && source.canAttachTo(target) ? [target] : [];
        } else if (source instanceof Permanent && target instanceof Permanent) {
            effect.performImmediate(new GameEvent_AttachPermanent(source, target));
        }
    }

    canAttachTo(target: Permanent) {
        return matchesTargetValidator(target, this);
    }
}
