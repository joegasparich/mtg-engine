import cardJSON from "../cards.json";
import leaJSON from "../cards_lea.json";
import lebJSON from "../cards_leb.json";
import keywordJSON from "../keyword_abilities.json";
import { AbilityDef,CardDef,Keyword } from "./defs";

export const cardData = [...cardJSON, ...leaJSON, ...lebJSON] as CardDef[];
export const keywordData = keywordJSON as Record<Keyword, AbilityDef>;
