import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager,{ ActionTarget } from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell,GameEvent_PlayLand } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Player from "@engine/Player";
import { CardType } from "~/defs";

export class PlayerAction_PlayCard extends PlayerAction {
    label() {
        return `Play ${this.object.name}`;
    }

    perform(player: Player) {
        if (!player || !this.canPlay(player)) return;

        if (this.object.type === CardType.Land) {
            gameEventManager.addEvent(new GameEvent_PlayLand(player, this.object));
            return;
        }

        const target = this.object.spellTargeter;
        if (target) {
            if (!playerActionManager.canAutoPay(this.object, player))
                return;

            // 601.2c, 601.2h
            playerActionManager.startTargeting(this.object, target.validTargets, target.count,
                targets => target.validateTargets(targets), targets => {
                    if (this.canPlay(player))
                        this.castSpell(player, targets);
                });
            return;
        }

        this.castSpell(player);
    }

    private canPlay(player: Player): boolean {
        return player === this.object.owner && this.object.zone === player.hand && this.object.canPlay();
    }

    private castSpell(player: Player, targets: readonly ActionTarget[] = []) {
        if (playerActionManager.payManaCost(this.object.cost, player))
            gameEventManager.addEvent(new GameEvent_CastSpell(player, this.object, targets));
    }
}
