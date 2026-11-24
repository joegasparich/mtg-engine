import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { autobind } from "@utility/typeUtility";
import { CardType } from "~/defs";
import { Ability,GrammarKey } from "../..";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Trigger } from "./AbilityPart_Trigger";

@RegisterAbilityPart
class AbilityPart_Trigger_Enters extends AbilityPart_Trigger {
    type: CardType;
    storeAs: GrammarKey;

    setup(ability: Ability) {
        super.setup(ability);

        if (ability.source.zone instanceof Battlefield)
            gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    cleanup(ability: Ability) {
        if (ability.source.zone instanceof Battlefield)
            gameEventManager.offPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        const entered = event.newObject;
        if (entered instanceof Permanent && entered.type === this.type)
            this.onTrigger(this.storeAs ? { [this.storeAs]: [entered] } : {});
    }
}