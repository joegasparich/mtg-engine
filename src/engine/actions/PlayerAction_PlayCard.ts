import Player from "../Player";
import {ManaUtility} from "../mana";
import gameEventManager from "../events/GameEventManager";
import {GameEvent_CastSpell} from "../events";

import {PlayerAction} from "./PlayerAction";

export class PlayerAction_PlayCard extends PlayerAction {
    targets: null;

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