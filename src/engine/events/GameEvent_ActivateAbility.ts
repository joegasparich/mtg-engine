import {GameEvent, GameEventType} from "./GameEventManager";
import {game} from "../Game";
import Card from "../Card";
import Player from "../Player";
import {ActionTarget} from "../actions";
import {Ability} from "../Ability";

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
        if (!this.ability.activated || !this.ability.canActivate(this.card)) {
            console.log("Attempted to trigger unpayable or non-activated ability");
            return;
        }

        // Pay cost
        this.ability.payCost(this.card);

        // Add ability to stack
        game.stack.abilityActivated(this.player, this.ability, this.targets);

        // TODO: pass priority
        game.stack.resolveAll();
    }
}