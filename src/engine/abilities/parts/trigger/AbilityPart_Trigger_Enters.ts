import {RegisterAbilityPart} from "@engine/abilities/registry";
import {Ability, AbilityPart_Trigger, GrammarKey} from "@engine/abilities";
import {CardType} from "~/defs";
import gameEventManager, {GameEventType} from "@engine/events/GameEventManager";
import {autobind} from "@utility/typeUtility";
import {GameEvent_ChangeCardZone} from "@engine/events";
import {Battlefield} from "@engine/Zone";

@RegisterAbilityPart
class AbilityPart_Trigger_Enters extends AbilityPart_Trigger {
    type: CardType;
    storeAs: GrammarKey;

    setup(ability: Ability) {
        super.setup(ability);

        gameEventManager.on(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    cleanup() {
        gameEventManager.off(GameEventType.ChangeCardZone, this.onCardChangedZone);
    }

    @autobind
    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        if (!(event.newZone instanceof Battlefield))
            return;

        if (event.card.type != this.type)
            return;

        if (this.storeAs)
            this.ability.slate[this.storeAs] = event.card;

        this.onTrigger();
    }
}