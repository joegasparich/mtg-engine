import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
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

        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    cleanup() {
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        if (!(event.newZone instanceof Battlefield))
            return;

        if (event.card.type != this.type)
            return;

        if (this.storeAs)
            this.ability.slate[this.storeAs] = [event.card];

        this.onTrigger();
    }
}