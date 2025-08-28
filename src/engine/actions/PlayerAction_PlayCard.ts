import Player from "../Player";
import {ManaUtility} from "../mana";
import gameEventManager from "../events/GameEventManager";
import {GameEvent_CastSpell} from "../events";
import {PlayerAction} from "./PlayerAction";
import Card from "../Card";
import {TargetWorkers} from "../abilities/TargetWorkers";
import {game} from "../Game";
import {ActionTarget} from "./PlayerActionManager";

export class PlayerAction_PlayCard extends PlayerAction {
    constructor(card: Card) {
        super(card);

        if (card.spellAbility?.targetWorker)
            this.targets = TargetWorkers.get(card.spellAbility.targetWorker).getValidTargets(card, game.activePlayer());
    }

    label() {
        return `Play ${this.card.name}`;
    }

    perform(player: Player, targets?: ActionTarget[]) {
        if (this.card.cost && !ManaUtility.canPay(this.card.cost, player.manaPool)) {
            console.log("Attempted to play card with unpayable cost");
            return;
        }

        ManaUtility.pay(this.card.cost, player.manaPool);

        gameEventManager.addEvent(new GameEvent_CastSpell(player, this.card, targets));
    }
}