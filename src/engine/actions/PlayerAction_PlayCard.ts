import {PlayerAction} from "@engine/actions/PlayerAction";
import Player from "@engine/Player";
import {ManaUtility} from "@engine/mana";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_CastSpell} from "@engine/events";

export class PlayerAction_PlayCard extends PlayerAction {
    label() {
        return `Play ${this.card.name}`;
    }

    perform(player: Player) {
        if (this.card.cost && !ManaUtility.canPay(this.card.cost, player.manaPool)) {
            console.log("Attempted to play card with unpayable cost");
            return;
        }

        ManaUtility.pay(this.card.cost, player.manaPool);

        gameEventManager.addEvent(new GameEvent_CastSpell(player, this.card));
    }
}