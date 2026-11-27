import { createAbilityPart,RegisterAbilityPart } from "@engine/abilities/registry";
import { type ObjectSelection,selectObjects } from "@engine/abilities/ZoneSelection";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { type OptionChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

type ChoiceOption = {
    label: string;
    when?: ObjectSelection;
    effect?: Record<string, object>;
};

@RegisterAbilityPart
export class AbilityPart_Choice extends AbilityPart_Effect {
    prompt = "Choose one.";
    options: readonly ChoiceOption[];

    perform(effect: OneShotEffect) {
        const { ability } = this;
        const player = ability.controller ?? ability.source.controller;
        // 608.2d: Determine the legal options when this instruction resolves.
        const available = (option: ChoiceOption) => !option.when || selectObjects(ability, option.when).length > 0;
        const options = this.options.filter(available);
        if (!player || !options.length)
            return;
        if (options.length === 1) {
            this.resolveOption(options[0], effect);
            return;
        }

        const currentGame = game;
        const choice: OptionChoice = {
            kind: ResolutionChoiceKind.Option, player, sourceName: ability.source.name, prompt: this.prompt,
            options: options.map(option => option.label),
            submit: (actor, index) => currentGame.submitResolutionChoice(choice, actor,
                () => Number.isInteger(index) && index >= 0 && index < options.length && available(options[index]),
                () => this.resolveOption(options[index], effect)),
        };
        currentGame.openResolutionChoice(choice);
    }

    private resolveOption(option: ChoiceOption, effect: OneShotEffect) {
        if (!option.effect)
            return;
        const entries = Object.entries(option.effect);
        if (entries.length !== 1)
            throw new Error("A choice option must specify a single effect part");
        const [name, config] = entries[0];
        const part = createAbilityPart(name, config);
        if (!(part instanceof AbilityPart_Effect))
            throw new Error(`Invalid choice effect: ${name}`);
        // The selected effect shares the slate and can signal the next instruction.
        part.ability = this.ability;
        part.perform(effect);
    }
}
