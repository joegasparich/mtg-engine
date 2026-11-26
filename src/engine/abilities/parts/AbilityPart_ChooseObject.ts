import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { selectObjectsFromZone,type ZoneSelection } from "@engine/abilities/ZoneSelection";
import { CardChoicePresentation,CardChoiceVisibility,type OptionalChoiceDetails,OptionalDecision } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import { CardObject } from "@engine/GameObject";
import { ZoneKind } from "@engine/Zone";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_ChooseObject extends AbilityPart_Effect {
    selection: ZoneSelection;
    saveAs: GrammarKey;
    prompt: string;
    optional?: Pick<OptionalChoiceDetails, "prompt" | "acceptLabel" | "declineLabel">;
    outSignal?: string;

    perform() {
        const { ability, selection } = this;
        const player = ability.controller ?? ability.source.controller;
        const finish = (cards: readonly CardObject[]) => {
            ability.slate[this.saveAs] = cards;
            if (this.outSignal)
                ability.fireSignal(this.outSignal);
        };
        const eligible = () => selectObjectsFromZone(ability, selection);
        const options = eligible().filter((object): object is CardObject => object instanceof CardObject);
        if (!player || !options.length) {
            finish([]);
            return;
        }

        const sourceName = ability.source.name;
        const choose = () => {
            const hidden = selection.zone === ZoneKind.Hand || selection.zone === ZoneKind.Library;
            game.requestResolutionChoice({
                player, sourceName, prompt: this.prompt, options, count: 1,
                presentation: selection.zone === ZoneKind.Battlefield ? CardChoicePresentation.Board : CardChoicePresentation.SingleCardList,
                ...(hidden ? { visibility: CardChoiceVisibility.Private }
                    : { visibility: CardChoiceVisibility.Public, earlierChoices: [] }),
            }, finish, object => eligible().includes(object));
        };

        if (this.optional) {
            game.requestOptionalChoice({ player, sourceName, ...this.optional }, decision => {
                if (decision === OptionalDecision.Accept)
                    choose();
                else
                    finish([]);
            });
        } else {
            choose();
        }
    }
}
