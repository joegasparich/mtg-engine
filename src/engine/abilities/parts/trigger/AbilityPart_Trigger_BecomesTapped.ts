import { type Ability,type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import gameEventManager from "@engine/events/GameEventManager";
import { RulesEventType } from "@engine/events/RulesEvent";
import { Battlefield } from "@engine/Zone";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
export class AbilityPart_Trigger_BecomesTapped extends AbilityPart_Trigger {
    subject?: GrammarKey;
    storeAs?: GrammarKey;
    targetValidator?: TargetValidator;
    opponentOnly = false;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source.zone instanceof Battlefield))
            return;

        // 603.10: Check the permanent's current characteristics and controller after the event.
        this.stopListening ??= gameEventManager.rules.on(RulesEventType.BecomesTapped,
            ({ permanent }) => this.onTrigger(this.storeAs ? { [this.storeAs]: [permanent] } : {}), {
                matches: ({ permanent }) => (!this.subject || permanent === resolveAbilityGrammar(this.subject, ability))
                    && matchesTargetValidator(permanent, this)
                    && (!this.opponentOnly || permanent.controller !== ability.source.controller),
            });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }
}
