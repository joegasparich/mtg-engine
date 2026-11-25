import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { Permanent } from "@engine/GameObject";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import type { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
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
        if (ability.source.zone instanceof Battlefield)
            this.stopListening ??= gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
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

    @autobind
    private onCardChangedZone(event: GameEvent_ChangeCardZone) {
        // 701.3d: The attachment ends when the object changes zones.
        const { source } = this.ability;
        if (source instanceof Permanent && event.oldObject === source.attachedTo)
            source.attachedTo = undefined;
    }
}
