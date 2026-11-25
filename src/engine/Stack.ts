import type { ActionTarget } from "@engine/actions";
import { Ability,HardcodedSignals } from "@engine/abilities";
import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell,StackAbility } from "@engine/GameObject";
import type Player from "@engine/Player";
import { Zone } from "@engine/Zone";
import { CardType } from "~/defs";

export class Stack extends Zone<Spell | StackAbility> {
    name = "Stack";
    private resolutionScheduled = false;
    private completeResolution?: () => void;
    private readonly waitingTriggers: StackAbility[] = [];

    spellCast(caster: Player, handObject: CardObject, targets: readonly ActionTarget[] = []): boolean {
        if (game.hasPendingPlayerInput || handObject.zone !== caster.hand || handObject.owner !== caster || handObject.type === CardType.Land)
            return false;

        // 601.2c
        const targeter = handObject.spellTargeter;
        if (targeter ? !targeter.validateTargets(targets) : targets.length > 0)
            return false;

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(handObject, this, { controller: caster, targets }));
        return true;
    }

    abilityActivated(caster: Player, ability: Ability) {
        this.onEnter(new StackAbility(caster, ability.source, ability, ability.activationSignal));
    }

    abilityTriggered(controller: Player, ability: Ability, signal: string, inputs: Ability["slate"]) {
        this.waitingTriggers.push(new StackAbility(controller, ability.source, ability, signal, inputs));
    }

    putWaitingTriggersOnStack(): boolean {
        const triggers = this.waitingTriggers.splice(0);
        if (!triggers.length)
            return false;

        for (const trigger of triggers)
            this.onEnter(trigger);
        this.resolveAll();
        return true;
    }

    resolveAll() {
        if (this.resolutionScheduled)
            return;

        this.resolutionScheduled = true;
        gameEventManager.onIdle(() => {
            const top = this.objects.at(-1);
            if (!top) {
                this.resolutionScheduled = false;
                return;
            }

            try {
                // 608.1: Resolve the top object after pending events and follow-ups settle.
                if (top instanceof Spell)
                    this.resolveSpell(top);
                else {
                    top.resolve();
                    // 608.2n: The ability ceases to exist at the end of resolution.
                    this.completeResolution = () => this.onLeave(top);
                }
            } catch (error) {
                this.resolutionScheduled = false;
                throw error;
            }

            gameEventManager.onIdle(() => {
                this.resolutionScheduled = false;
                // A prevented move must not cause the same spell to resolve again.
                if (this.objects.length > 0 && !this.objects.includes(top))
                    this.resolveAll();
            });
        });
    }

    resolveSpell(spell: Spell) {
        if (spell.zone !== this || this.completeResolution || game.pendingResolutionChoice)
            return;

        if (!gameEventManager.performingEvents) {
            gameEventManager.onIdle(() => this.resolveSpell(spell));
            return;
        }

        switch (spell.type) {
            case CardType.Creature:
            case CardType.Enchantment:
            case CardType.Artifact: {
                if (this.resolveSpellEffects(spell)) {
                    this.completeResolution = () => {
                        if (spell.zone !== this)
                            return;

                        const resolver = spell.abilities.flatMap(ability => ability.parts).find(part => part.resolvePermanentSpell);
                        const event = resolver?.resolvePermanentSpell(spell)
                            ?? new GameEvent_ChangeCardZone(spell, spell.controller.battlefield);
                        // 608.3b–c: Validate and commit permanent entry in the same resolution.
                        gameEventManager.performImmediate(event);
                    };
                    return;
                }
                break;
            }
            case CardType.Sorcery:
            case CardType.Instant:
                this.resolveSpellEffects(spell);
                break;
            default:
                return;
        }
        // 608.2n: Move the spell after the last instruction and its follow-ups.
        this.completeResolution = () => {
            if (spell.zone === this)
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(spell, spell.owner.graveyard));
        };
    }

    finishResolution(): boolean {
        const complete = this.completeResolution;
        if (!complete)
            return false;

        this.completeResolution = undefined;
        complete();
        return true;
    }

    private resolveSpellEffects(spell: Spell): boolean {
        // 400.7 and 608.2b: A target that changed zones is a different object.
        const target = spell.spellTargeter;
        if (target && !target.validateTargets(spell.targets))
            return false;

        target?.applyTargets(spell.targets);
        for (const ability of spell.abilities)
            ability.fireSignal(HardcodedSignals.SpellResolve);
        return true;
    }
}
