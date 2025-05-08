import Card from "./Card";
import * as PIXI from "pixi.js";
import {game, pixi} from "./renderer";
import {calculateCardPositionsRelativeToCenter} from "./drawUtility";
import {CardType} from "./CardDef";
import gameEventManager from "./GameEvents/GameEventManager";
import ActivatedAbility from "./ActivatedAbility";
import {abilityEffects} from "./workers";
import {GameEvent_ChangeCardZone} from "./GameEvents";
import {shuffleArray} from "./arrayUtility";

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
    constructor() {
        super();

        this.name = "Library"
    }

    shuffle() {
        shuffleArray(this.cards);
    }

    getTopCard(): Card {
        return this.cards.at(-1);
    }
}

export class Battlefield extends Zone {
    nextCardPos = 100;

    // Rendering
    container = new PIXI.Container()

    constructor() {
        super();

        this.name = "Battlefield";
    }

    onEnter(card: Card) {
        super.onEnter(card);

        card.position = new PIXI.Point(this.nextCardPos, this.nextCardPos);
        this.nextCardPos += 10;

        this.container.addChild(card);
    }

    onLeave(card: Card) {
        super.onLeave(card);

        this.container.removeChild(card);
    }
}

export class Hand extends Zone {
    // Rendering
    container = new PIXI.Container()

    constructor() {
        super();

        this.name = "Hand";
    }

    onEnter(card: Card): void {
        super.onEnter(card);

        this.container.addChild(card);

        const positions = calculateCardPositionsRelativeToCenter(this.cards.length, card.width + 30, pixi.screen.width * 0.67)
        for (let i = 0; i < this.cards.length; i++) {
            this.cards[i].position.x = positions[i];
        }
    }

    onLeave(card: Card): void {
        super.onLeave(card);

        this.container.removeChild(card);
    }
}

export class Stack extends Zone {
    stack: (Card | ActivatedAbility)[] = [];

    constructor() {
        super();

        this.name = "Stack";
    }

    onEnter(card: Card) {
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
        const player = game.players[spell.controllerID];

        switch (spell.def.type) {
            case CardType.Land:
            case CardType.Creature:
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell, player.battlefield));
                break;
            default:
                break;
        }
    }

    private resolveAbility(ability: ActivatedAbility) {
        for (const effect of ability.def.effects) {
            abilityEffects.get(effect.type).perform(effect, ability.card, ability.ownerID)
        }
    }
}