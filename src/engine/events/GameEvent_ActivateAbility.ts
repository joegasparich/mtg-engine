import { Ability } from "@engine/abilities";
import Card from "@engine/Card";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";

export class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    player: Player;
    card: Card;
    ability: Ability;

    constructor(player: Player, card: Card, ability: Ability) {
        super();

        this.player = player;
        this.card = card;
        this.ability = ability;

        // TODO: Log ability label
        this.label = `Player ${player.id} activated ability of ${card.logName} (TODO)`;
    }

    perform(): boolean {
        if (game.pendingTargeter || !this.ability.activatable || !this.ability.canActivate())
            return false;

        if (!this.ability.payActivationCost())
            return false;

        // 605.3b
        if (this.ability.def.isManaAbility) {
            this.ability.resolveActivation();
            return true;
        }

        // Add ability to stack
        game.stack.abilityActivated(this.player, this.ability);//, this.targets);

        // TODO: pass priority
        game.stack.resolveAll();
        return true;
    }
}
