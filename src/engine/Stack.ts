import type { ActionTarget } from "@engine/actions";
import Card from "@engine/Card";
import Player from "@engine/Player";
import { Zone } from "@engine/Zone";
import { Ability,HardcodedSignals } from "@engine/abilities";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { CardType } from "~/defs";

export class Spell {
    owner: Player;

    card: Card;
    readonly targets: readonly ActionTarget[];

    constructor(owner: Player, card: Card, targets: readonly ActionTarget[]) {
        this.owner = owner;
        this.card = card;
        this.targets = [...targets];
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

    spellCast(caster: Player, card: Card, targets: readonly ActionTarget[] = []): boolean {
        if (card.type === CardType.Land)
            return false;

        // 601.2c
        const target = card.spellTarget;
        if (target ? !target.validateTargets(targets) : targets.length > 0)
            return false;

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, this));
        this.stack.push(new Spell(caster, card, targets));
        return true;
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
            case CardType.Creature:
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell.card, spell.owner.battlefield));
                break;
            case CardType.Sorcery:
            case CardType.Instant: {
                // 608.2b
                const target = spell.card.spellTarget;
                if (!target || target.validateTargets(spell.targets)) {
                    target?.applyTargets(spell.targets);
                    for (const ability of spell.card.abilities) {
                        ability.fireSignal(HardcodedSignals.SpellResolve);
                    }
                }
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell.card, spell.owner.graveyard));
                break;
            }
            default:
                break;
        }
    }

    resolveAbility(ability: Ability) {
        ability.resolveActivation();
    }
}
