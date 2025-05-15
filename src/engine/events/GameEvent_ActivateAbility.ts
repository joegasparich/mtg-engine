import ActivatedAbility from "../ActivatedAbility";
import {GameEvent, GameEventType} from "./GameEventManager";
import {game} from "../Game";
import {ActivatedAbilityCosts} from "../abilities/ActivatedAbilityCosts";

export class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    ability: ActivatedAbility;

    constructor(ability: ActivatedAbility) {
        super();

        this.ability = ability;

        this.label = `Player ${ability.owner.id} activated ability of ${ability.card.logName} (${ability.label()})`;
    }

    perform() {
        // Pay cost
        ActivatedAbilityCosts.get(this.ability.def.cost).pay(this.ability.card, this.ability.owner);

        // Add ability to stack
        game.stack.abilityActivated(this.ability);

        // TODO: pass priority
        game.stack.resolveAll();
    }
}