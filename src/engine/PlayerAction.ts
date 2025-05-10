import Card from "./Card";
import {ActivatedAbilityDef} from "../defs";
import {abilityEffects} from "./workers";
import gameEventManager from "./events/GameEventManager";
import ActivatedAbility from "./ActivatedAbility";
import {GameEvent_CastSpell} from "./events";
import Player from "./Player";

export interface PlayerAction {
    label: () => string;
    perform: (owner: Player) => void;
    // target
}
export class PlayerAction_PlayCard implements PlayerAction {
    card: Card;

    constructor(card: Card) {
        this.card = card;
    }

    label() {
        return `Play ${this.card.name}`;
    }

    perform(player: Player) {
        if (this.card.cost && !player.manaPool.canPay(this.card.cost)) {
            console.log("Attempted to play card with unpayable cost")
            return;
        }

        player.manaPool.pay(this.card.cost);

        gameEventManager.addEvent(new GameEvent_CastSpell(player, this.card));
    }
}
export class PlayerAction_ActivatedAbility implements PlayerAction {
    abilityDef: ActivatedAbilityDef;
    card: Card;

    constructor(abilityDef: ActivatedAbilityDef, card: Card) {
        this.abilityDef = abilityDef;
        this.card = card;
    }

    label() {
        return `${this.abilityDef.cost}: ${this.abilityDef.effects.map(e => abilityEffects.get(e.type).label(e, this.card)).join(", ")}`
    }

    perform(player: Player) {
        const ability = new ActivatedAbility(player, this.abilityDef, this.card);

        ability.perform()
    }
}