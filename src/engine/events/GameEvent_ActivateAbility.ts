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

    perform() {
        if (!this.ability.activatable || !this.ability.canActivate()) {
            console.log("Attempted to trigger unpayable or non-activated ability");
            return;
        }

        // Pay cost
        this.ability.payActivationCost();

        // Add ability to stack
        game.stack.abilityActivated(this.player, this.ability);//, this.targets);

        // TODO: pass priority
        game.stack.resolveAll();
    }
}