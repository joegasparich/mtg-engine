import cardJSON from "../cards.json";
import keywordJSON from "../keyword_abilities.json";
import {AbilityDef, CardDef, Keyword} from "./defs";

export const cardData = cardJSON as CardDef[];
export const keywordData = keywordJSON as Record<Keyword, AbilityDef>;