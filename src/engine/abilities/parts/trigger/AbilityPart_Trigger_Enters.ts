import { RulesEventType } from "@engine/events/RulesEvent";
import gameEventManager from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { CardType } from "~/defs";
import { Ability,GrammarKey } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
class AbilityPart_Trigger_Enters extends AbilityPart_Trigger {
    type: CardType;
    storeAs: GrammarKey;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        if (!(ability.source.zone instanceof Battlefield))
            return;

        // 603.6a: An enters trigger checks the permanent that entered the battlefield.
        this.stopListening ??= gameEventManager.rules.on(RulesEventType.ZoneChanged,
            event => this.onTrigger(this.storeAs ? { [this.storeAs]: [event.newObject] } : {}), {
                matches: ({ newObject }) => newObject instanceof Permanent && newObject.hasType(this.type),
            });
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
    }
}
