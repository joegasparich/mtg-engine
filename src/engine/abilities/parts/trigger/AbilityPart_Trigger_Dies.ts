import type { Ability } from "@engine/abilities/Ability";
import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { beforeZoneChange } from "@engine/events/GameEvent_ChangeCardZone";
import { game } from "@engine/Game";
import { StackAbility } from "@engine/GameObject";
import { Battlefield,Graveyard } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_Dies extends AbilityPart_Trigger {
    subject: GrammarKey | TargetValidator = "THIS";
    storeAs?: GrammarKey;
    beforeMoveSignal?: string;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source.zone instanceof Battlefield))
            return;

        this.stopListening ??= beforeZoneChange(move => {
            const dying = move.departingPermanent;
            if (!dying || !(move.newZone instanceof Graveyard))
                return;
            const matches = typeof this.subject === "string" ? dying === resolveAbilityGrammar(this.subject, ability)
                : matchesTargetValidator(dying, this.subject);
            if (!matches)
                return;

            // 603.2c, 603.10a: Each matching death reads the pre-move battlefield into its own slate.
            const inputs = this.storeAs ? { [this.storeAs]: [dying] } : {};
            const trigger = new StackAbility(ability.source.controller, ability.source, ability, this.outSignal, inputs);
            if (this.beforeMoveSignal)
                trigger.ability.fireSignal(this.beforeMoveSignal);
            return () => game.stack.queueTrigger(trigger);
        });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }
}
