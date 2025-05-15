import {cardData} from "../../index";

export const FOREST = cardData.findIndex(c => c.name == "Forest");
export const GRIZZLY_BEARS = cardData.findIndex(c => c.name == "Grizzly Bears");
export const MONS_GOBLIN_RAIDERS = cardData.findIndex(c => c.name == "Mons's Goblin Raiders");
export const AIR_ELEMENTAL = cardData.findIndex(c => c.name == "Air Elemental");

export const BASIC_DECK = [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS];