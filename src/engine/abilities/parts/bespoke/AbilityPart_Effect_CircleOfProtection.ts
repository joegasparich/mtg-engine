import { RegisterAbilityPart } from "@engine/abilities/registry";
import { DamagePreventionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { CardChoicePresentation,CardChoiceVisibility } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell } from "@engine/GameObject";
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

        const { colour } = this;
        const hasColour = (source: CardObject) => source.colours.has(colour);
        const eligibleSources = () => this.getDamageSources().filter(hasColour);
        const options = eligibleSources();
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
        }, ([source]) => {
            gameEventManager.startContinuousUntilEndOfTurn(this.ability, {
                kind: ContinuousEffectKind.DamagePrevention,
                prevention: {
                    kind: DamagePreventionKind.NextHit,
                    recipient: player,
                    source,
                    matches: ({ source }) => hasColour(source),
                    equivalenceKey: colour,
                },
            });
        }, source => eligibleSources().includes(source));
    }

    private getDamageSources(): CardObject[] {
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
        return [...sources];
    }
}
