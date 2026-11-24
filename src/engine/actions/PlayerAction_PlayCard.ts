import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager,{ ActionTarget } from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell,GameEvent_PlayLand } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { CardType } from "~/defs";

export class PlayerAction_PlayCard extends PlayerAction {
    label() {
        return `Play ${this.card.name}`;
    }

    perform(player: Player) {
        if (!player || !this.canPlay(player)) return;

        if (this.card.type === CardType.Land) {
            gameEventManager.addEvent(new GameEvent_PlayLand(player, this.card));
            return;
        }

        const target = this.card.spellTarget;
        if (target) {
            if (!playerActionManager.canAutoPay(this.card, player))
                return;

            // 601.2c, 601.2h
            playerActionManager.startTargeting(this.card, target.validTargets, target.count,
                targets => target.validateTargets(targets), targets => {
                    if (this.canPlay(player))
                        this.castSpell(player, targets);
                });
            return;
        }

        this.castSpell(player);
    }

    private canPlay(player: Player): boolean {
        return player === this.card.controller && this.card.zone === player.hand && this.card.canPlay();
    }

    private castSpell(player: Player, targets: readonly ActionTarget[] = []) {
        if (game.infiniteMana || this.payMana(player))
            gameEventManager.addEvent(new GameEvent_CastSpell(player, this.card, targets));
    }

    private payMana(player: Player): boolean {
        if (!ManaUtility.canPay(this.card.cost, player.manaPool)) {
            if (!playerActionManager.canAutoPay(this.card, player)) return false;
            playerActionManager.autoPay(this.card, player);
        }

        if (this.card.cost && !ManaUtility.canPay(this.card.cost, player.manaPool)) {
            console.log("Attempted to play card with unpayable cost");
            return false;
        }

        ManaUtility.pay(this.card.cost, player.manaPool);
        return true;
    }
}
