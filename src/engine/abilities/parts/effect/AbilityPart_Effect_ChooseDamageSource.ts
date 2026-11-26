import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { CardChoicePresentation,CardChoiceVisibility } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject,Spell } from "@engine/GameObject";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseDamageSource extends AbilityPart_Effect {
    targetValidator?: TargetValidator;
    saveAs: string;
    outSignal: string;

    perform() {
        const player = this.ability.controller ?? this.ability.source.controller;
        if (!player)
            return;

        const eligibleSources = () => this.getDamageSources().filter(source => matchesTargetValidator(source, this));
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
            this.ability.slate[this.saveAs] = [source];
            this.ability.fireSignal(this.outSignal);
        }, source => eligibleSources().includes(source));
    }

    private getDamageSources(): CardObject[] {
        // 609.7a: Permanents, spells, and objects referenced by the stack or waiting effects are eligible sources.
        const sources = new Set<CardObject>(game.players.flatMap(player => player.battlefield.objects));
        for (const entry of game.stack.objects) {
            const references = entry instanceof Spell
                ? [entry, ...entry.targets]
                : [entry.source, ...entry.targets, ...Object.values(entry.ability.slate).flat()];
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
