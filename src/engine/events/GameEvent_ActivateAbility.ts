import {GameEvent, GameEventType} from "@engine/events/GameEventManager";
import Player from "@engine/Player";
import Card from "@engine/Card";
import {Ability} from "@engine/abilities";
import {ActionTarget} from "@engine/actions";
import {game} from "@engine/Game";

export class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    player: Player;
    card: Card;
    ability: Ability;
    targets: ActionTarget[];

    constructor(player: Player, card: Card, ability: Ability, targets?: ActionTarget[]) {
        super();

        this.player = player;
        this.card = card;
        this.ability = ability;
        this.targets = targets;

        // TODO: Log ability label
        this.label = `Player ${player.id} activated ability of ${card.logName} (TODO)`;
    }

    perform() {
        if (!this.ability.activatable || !this.ability.canActivate(this.card)) {
            console.log("Attempted to trigger unpayable or non-activated ability");
            return;
        }

        // Pay cost
        this.ability.payCost(this.card);

        // Add ability to stack
        game.stack.abilityActivated(this.player, this.ability);//, this.targets);

        // TODO: pass priority
        game.stack.resolveAll();
    }
}