import cardJSON from "../cards.json";
import leaJSON from "../cards_lea.json";
import lebJSON from "../cards_leb.json";
import keywordJSON from "../keyword_abilities.json";
import { AbilityDef,CardDef,Keyword } from "./defs";
import { renderRulesText } from "~/rulesWords";

export const cardData = ([...cardJSON, ...leaJSON, ...lebJSON] as CardDef[]).map(def =>
    def.rulesTextTemplate ? { ...def, oracle_text: renderRulesText(def.rulesTextTemplate) } : def);
export const keywordData = keywordJSON as Record<Keyword, AbilityDef>;
