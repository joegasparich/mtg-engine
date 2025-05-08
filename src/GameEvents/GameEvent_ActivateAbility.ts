import ActivatedAbility from "../ActivatedAbility";
import {activatedAbilitiesCosts} from "../workers";
import {game} from "../renderer";
import {GameEvent, GameEventType} from "./GameEventManager";

export default class GameEvent_ActivateAbility extends GameEvent {
    type = GameEventType.ActivateAbility;

    ability: ActivatedAbility;

    constructor(ability: ActivatedAbility) {
        super();

        this.ability = ability;

        this.label = `Player ${ability.ownerID} activated ability of ${ability.card.def.name} (${ability.label()})`;
    }

    perform() {
        // Pay cost
        activatedAbilitiesCosts.get(this.ability.def.cost).pay(this.ability.card, this.ability.ownerID);

        // Add ability to stack
        game.stack.abilityActivated(this.ability);

        // TODO: pass priority
        game.stack.resolveAll();
    }
}