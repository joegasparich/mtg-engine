import Card from "../Card";
import {GameEvent, GameEventType} from "./GameEventManager";
import {game} from "../Game";
import Player from "../Player";
import {ActionTarget} from "../actions";

export class GameEvent_CastSpell extends GameEvent {
    type = GameEventType.CastSpell;

    caster: Player;
    card: Card;
    targets: ActionTarget[];

    constructor(caster: Player, card: Card, targets?: ActionTarget[]) {
        super();

        this.caster = caster;
        this.card = card;
        this.targets = targets;

        this.label = `Player ${this.caster.id} cast ${this.card.logName}`;
    }

    perform() {
        game.stack.spellCast(this.caster, this.card, this.targets);
        game.stack.resolveAll();
    }
}