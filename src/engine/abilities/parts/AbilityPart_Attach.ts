import { resolveAbilityGrammar,type GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { Permanent } from "@engine/GameObject";
import type { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import { GameEvent_DetachPermanent } from "@engine/events/GameEvent_DetachPermanent";
import gameEventManager,{ type GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import type { TargetValidator } from "~/defs";
import type { Ability } from "../Ability";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Attach extends AbilityPart {
    inSignal = "default";
    target: GrammarKey;
    saveAs?: string;
    targetValidator?: TargetValidator;

    setup(ability: Ability) {
        super.setup(ability);
        if (ability.source.zone instanceof Battlefield)
            gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    cleanup(ability: Ability) {
        if (ability.source.zone instanceof Battlefield)
            gameEventManager.offPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    onSignalFired(signal: string) {
        if (signal !== this.inSignal)
            return;

        const target = resolveAbilityGrammar(this.target, this.ability);
        const attachment = target instanceof Permanent && this.canAttachTo(target) ? target : undefined;
        if (this.saveAs) {
            this.ability.slate[this.saveAs] = attachment ? [attachment] : [];
        } else if (this.ability.source instanceof Permanent && this.ability.source.zone instanceof Battlefield && attachment) {
            this.ability.source.attachedTo = attachment;
        }
    }

    checkState(actions: GameEvent[]) {
        const { source } = this.ability;
        // 704.5m–n: The Aura part handles graveyard moves. Illegal Equipment attachments are removed.
        if (source instanceof Permanent && source.attachedTo && !source.subtypes.includes("Aura") && !source.hasLegalAttachment())
            actions.push(new GameEvent_DetachPermanent(source));
    }

    canAttachTo(target: Permanent) {
        // 701.3a: An attachment must satisfy the permanent's attachment restrictions.
        return target !== this.ability.source && target.zone instanceof Battlefield
            && matchesTargetValidator(target, this);
    }

    @autobind
    private onCardChangedZone(event: GameEvent_ChangeCardZone) {
        // 701.3d: The attachment ends when the object changes zones.
        const { source } = this.ability;
        if (source instanceof Permanent && event.oldObject === source.attachedTo)
            source.attachedTo = undefined;
    }
}
