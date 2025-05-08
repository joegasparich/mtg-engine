import Card from "./Card";
import {game} from "./renderer";
import {ActivatedAbilityDef} from "./CardDef";
import {abilityEffects} from "./workers";
import gameEventManager from "./GameEvents/GameEventManager";
import ActivatedAbility from "./ActivatedAbility";
import {GameEvent_CastSpell} from "./GameEvents";

export interface PlayerAction {
    label: () => string;
    perform: (ownerID: number) => void;
    // target
}
export class PlayerAction_PlayCard implements PlayerAction {
    card: Card;

    constructor(card: Card) {
        this.card = card;
    }

    label() {
        return `Play ${this.card.def.name}`;
    }

    perform(playerID: number) {
        const player = game.players[playerID];

        if (this.card.cost && !player.manaPool.canPay(this.card.cost)) {
            console.log("Attempted to play card with unpayable cost")
            return;
        }

        player.manaPool.pay(this.card.cost);

        gameEventManager.addEvent(new GameEvent_CastSpell(playerID, this.card));
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

    perform(playerID: number) {
        const ability = new ActivatedAbility(playerID, this.abilityDef, this.card);

        ability.perform()
    }
}