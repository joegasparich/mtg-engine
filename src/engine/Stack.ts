import Player from "@engine/Player";
import Card from "@engine/Card";
import {ActionTarget} from "@engine/actions";
import {Zone} from "@engine/Zone";
import {Ability, HardcodedSignals} from "@engine/abilities";
import gameEventManager from "@engine/events/GameEventManager";
import {GameEvent_ChangeCardZone} from "@engine/events";
import {CardType} from "~/defs";

export class Spell {
    owner: Player;

    card: Card;

    constructor(owner: Player, card: Card) {
        this.owner = owner;
        this.card = card;
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
    name = "Stack";
    stack: (Spell | Ability)[] = [];

    spellCast(caster: Player, card: Card) {
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, this));
        this.stack.push(new Spell(caster, card));
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
                for (const ability of spell.card.abilities) {
                    ability.fireSignal(HardcodedSignals.Resolve);
                }
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell.card, spell.owner.graveyard));
                break;
            default:
                break;
        }
    }

    resolveAbility(ability: Ability) {
        ability.resolveActivation();
    }
}