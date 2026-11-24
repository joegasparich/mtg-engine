import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";

export class PlayerAction_PlayCard extends PlayerAction {
    label() {
        return `Play ${this.card.name}`;
    }

    perform(player: Player) {
        if (!ManaUtility.canPay(this.card.cost, player.manaPool)) {
            if (!playerActionManager.canAutoPay(this.card, player)) return;
            playerActionManager.autoPay(this.card, player);
        }

        if (this.card.cost && !ManaUtility.canPay(this.card.cost, player.manaPool)) {
            console.log("Attempted to play card with unpayable cost");
            return;
        }

        ManaUtility.pay(this.card.cost, player.manaPool);

        gameEventManager.addEvent(new GameEvent_CastSpell(player, this.card));
    }
}