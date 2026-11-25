import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import { CardChoicePresentation,CardChoiceVisibility } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { CardColour } from "~/defs";
import { AbilityPart_Effect } from "../effect/AbilityPart_Effect";

// TODO: Next time we add a card that chooses a source of damage, refactor that part of this out of here
@RegisterAbilityPart
export class AbilityPart_Effect_CircleOfProtection extends AbilityPart_Effect {
    colour: CardColour;

    perform() {
        const player = this.ability.controller;
        if (!player)
            return;

        const options = this.getEligibleSources();
        if (options.length === 0)
            return;

        game.requestResolutionChoice({
            player,
            sourceName: this.ability.source.name,
            prompt: "Choose a damage source.",
            options,
            count: 1,
            visibility: CardChoiceVisibility.Public,
            earlierChoices: [],
            presentation: CardChoicePresentation.SingleCardList,
        }, ([source]) => this.preventNextDamage(player, source), source => this.getEligibleSources().includes(source));
    }

    private getEligibleSources(): CardObject[] {
        // 609.7a: Permanents, spells, and objects referenced by the stack or waiting effects are eligible sources.
        const sources = new Set<CardObject>(game.players.flatMap(player => player.battlefield.objects));
        for (const entry of game.stack.objects) {
            const references = entry instanceof Spell
                ? [entry, ...entry.targets]
                : [entry.source, ...Object.values(entry.ability.slate).flat()];
            for (const reference of references) {
                if (reference instanceof CardObject)
                    sources.add(reference);
            }
        }
        for (const reference of gameEventManager.effects.getEventCheckReferences())
            sources.add(reference);
        return [...sources].filter(source => source.colours.has(this.colour));
    }

    private preventNextDamage(player: Player, source: CardObject) {
        // 609.7a: Follow a permanent spell into the permanent it becomes.
        const references = () => source instanceof Spell && source.resolvedPermanent
            ? [source, source.resolvedPermanent] : [source];
        const end = gameEventManager.effects.startContinuous(this.ability, {
            kind: ContinuousEffectKind.EventCheck,
            beforeCommit: true,
            references,
            check: check => {
                // 609.7b and 615.8–9: Recheck colour and use up the shield only when it prevents damage.
                const removed = check.removeWhere(event => event instanceof GameEvent_DealDamage
                    && event.recipient === player && event.canDealDamage() && references().includes(event.source)
                    && event.source.colours.has(this.colour));
                if (removed && check.committing)
                    endShield();
            },
        });
        // 514.2: An unused shield expires in cleanup.
        const cancelCleanup = gameEventManager.onGamePerformed(GameEventType.Cleanup, endShield, { once: true });
        function endShield() {
            cancelCleanup();
            end();
        }
    }
}
