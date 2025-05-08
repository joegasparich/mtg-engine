import Card from "./Card";
import {CardType} from "../defs";
import gameEventManager from "./events/GameEventManager";
import ActivatedAbility from "./ActivatedAbility";
import {abilityEffects} from "./workers";
import {GameEvent_ChangeCardZone} from "./events";
import {shuffleArray} from "../utility/arrayUtility";
import {game} from "./root";

export class Zone {
    name: string;
    cards: Card[] = [];

    onEnter(card: Card) {
        this.cards.push(card)
    }

    onLeave(card: Card) {
        this.cards = this.cards.filter(o => o != card);
    }
}

export class Library extends Zone {
    name = "Library"

    shuffle() {
        shuffleArray(this.cards);
    }

    getTopCard(): Card {
        return this.cards.at(-1);
    }
}

export class Battlefield extends Zone {
    name = "Battlefield";
}

export class Hand extends Zone {
    name = "Hand";
}

export class Stack extends Zone {
    stack: (Card | ActivatedAbility)[] = [];

    constructor() {
        super();

        this.name = "Stack";
    }

    override onEnter(card: Card) {
        super.onEnter(card);

        this.stack.push(card);
    }

    abilityActivated(ability: ActivatedAbility) {
        this.stack.push(ability);
    }

    resolveAll() {
        // gameEventManager.addEvent(new GameEvent_SimpleEvent(GameEventType.Log, "Stack Resolving"));

        while (this.stack.length > 0) {
            const spellOrAbility = this.stack.pop();

            if (spellOrAbility instanceof Card)
                this.resolveSpell(spellOrAbility);
            else if (spellOrAbility instanceof ActivatedAbility)
                this.resolveAbility(spellOrAbility);
        }

        // gameEventManager.addEvent(new GameEvent_SimpleEvent(GameEventType.Log, "Stack Resolved"));
    }

    private resolveSpell(spell: Card) {
        switch (spell.def.type) {
            case CardType.Land:
            case CardType.Creature:
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell, spell.controller.battlefield));
                break;
            default:
                break;
        }
    }

    private resolveAbility(ability: ActivatedAbility) {
        for (const effect of ability.def.effects) {
            abilityEffects.get(effect.type).perform(effect, ability.card, ability.owner)
        }
    }
}