import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ColourChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { cardColours } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseColour extends AbilityPart_Effect {
    chooser: GrammarKey;
    prompt = "Choose a colour.";
    exceptFrom?: string;
    saveAs: string;
    outSignal?: string;

    perform() {
        const { ability } = this;
        const player = resolveAbilityGrammar(this.chooser, ability);
        if (!(player instanceof Player))
            return;

        const excluded = this.exceptFrom && ability.slate[this.exceptFrom]?.[0];
        const options = cardColours.filter(colour => colour !== excluded);
        const currentGame = game;
        const choice: ColourChoice = {
            kind: ResolutionChoiceKind.Colour,
            player,
            sourceName: ability.source.name,
            prompt: this.prompt,
            options,
            submit: (actor, colour) => currentGame.submitResolutionChoice(choice, actor, () => options.includes(colour), () => {
                ability.slate[this.saveAs] = [colour];
                if (this.outSignal)
                    ability.fireSignal(this.outSignal);
            }),
        };
        currentGame.openResolutionChoice(choice);
    }
}
