import { isBasicLandType,renderRulesText,type WordReplacement } from "~/rulesWords";
import { change,Layer } from "./Layers";

export function replaceRulesWord(replacement: WordReplacement) {
    return change(Layer.Text, () => [replacement] as const, (state, edit) => {
        state.wordReplacements = [...state.wordReplacements, edit];
        if (state.definition.rulesTextTemplate)
            state.rulesText = renderRulesText(state.definition.rulesTextTemplate, state.wordReplacements);
        const matches = (type: string) => edit.from === undefined ? isBasicLandType(type) : type === edit.from;
        if (state.subtypes.some(matches))
            state.subtypes = [...new Set(state.subtypes.map(type => matches(type) ? edit.to : type))];
    });
}
