import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type BasicLandTypeChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { BasicLandType } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChooseBasicLandType extends AbilityPart_Effect {
    prompt: string;
    exceptFrom?: string;
    saveAs: string;
    outSignal: string;

    perform() {
        const { ability } = this;
        const player = ability.controller ?? ability.source.controller;
        const excluded = this.exceptFrom && ability.slate[this.exceptFrom]?.[0];
        const options = Object.values(BasicLandType).filter(type => type !== excluded);
        const currentGame = game;
        const choice: BasicLandTypeChoice = {
            kind: ResolutionChoiceKind.BasicLandType, player, sourceName: ability.source.name, prompt: this.prompt, options,
            submit: (actor, type) => currentGame.submitResolutionChoice(choice, actor, () => options.includes(type), () => {
                ability.slate[this.saveAs] = [type];
                ability.fireSignal(this.outSignal);
            }),
        };
        currentGame.openResolutionChoice(choice);
    }
}
