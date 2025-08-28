import Card from "./Card";
import {CardType} from "../defs";
import gameEventManager from "./events/GameEventManager";
import {GameEvent_ChangeCardZone} from "./events";
import {ActionTarget} from "./actions";
import Player from "./Player";
import {Zone} from "./Zone";
import {Ability} from "./Ability";

export class Spell {
    owner: Player;

    card: Card;
    targets: ActionTarget[];

    constructor(owner: Player, card: Card, targets: ActionTarget[]) {
        this.owner = owner;
        this.card = card;
        this.targets = targets;
    }
}

// export class Ability {
//     owner: Player;
//
//     effects: AbilityEffectDef[];
//     targets: ActionTarget[];
//
//     constructor(owner: Player, effects: AbilityEffectDef[], targets?: ActionTarget[]) {
//         this.owner = owner;
//         this.effects = effects;
//         this.targets = targets;
//     }
// }

export class Stack extends Zone {
    stack: (Spell | Ability)[] = [];

    spellCast(caster: Player, card: Card, targets?: ActionTarget[]) {
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, this));
        this.stack.push(new Spell(caster, card, targets));
    }

    abilityActivated(caster: Player, ability: Ability) {
        this.stack.push(ability);
    }

    abilityTriggered(caster: Player, ability: Ability) {
        this.stack.push(ability);
    }

    resolveAll() {
        // gameEventManager.addEvent(new GameEvent_SimpleEvent(GameEventType.Log, "Stack Resolving"));

        while (this.stack.length > 0) {
            const spellOrAbility = this.stack.pop();

            if (spellOrAbility instanceof Spell)
                this.resolveSpell(spellOrAbility);
            else if (spellOrAbility instanceof Ability)
                this.resolveAbility(spellOrAbility);
        }

        // gameEventManager.addEvent(new GameEvent_SimpleEvent(GameEventType.Log, "Stack Resolved"));
    }

    resolveSpell(spell: Spell) {
        switch (spell.card.type) {
            case CardType.Land:
            case CardType.Creature:
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell.card, spell.owner.battlefield));
                break;
            case CardType.Sorcery:
            case CardType.Instant:
                // for (const effect of spell.card.spellAbility.effects) {
                //     AbilityEffects.get(effect.worker).perform(effect, spell.targets, spell.owner);
                // }
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell.card, spell.owner.graveyard));
                break;
            default:
                break;
        }
    }

    resolveAbility(ability: Ability) {
        ability.resolve();
    }
}