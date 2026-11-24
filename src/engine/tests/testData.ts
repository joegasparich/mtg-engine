import Card from "@engine/Card";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { Zone } from "@engine/Zone";
import type { CardDef } from "~/defs";
import { cardData } from "~/index";

export const FOREST = cardData.findIndex(c => c.name == "Forest");
export const MOUNTAIN = cardData.findIndex(c => c.name == "Mountain");
export const GRIZZLY_BEARS = cardData.findIndex(c => c.name == "Grizzly Bears");
export const MONS_GOBLIN_RAIDERS = cardData.findIndex(c => c.name == "Mons's Goblin Raiders");
export const AIR_ELEMENTAL = cardData.findIndex(c => c.name == "Air Elemental");
export const ANCESTRAL_RECALL = cardData.findIndex(c => c.name == "Ancestral Recall");

export const BASIC_DECK = [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS];
export function moveTestCard<T extends CardObject>(object: CardObject, zone: Zone<T>): T {
    const event = new GameEvent_ChangeCardZone(object, zone);
    gameEventManager.addEvent(event);
    return event.newObject as T;
}

export function addTestCard<T extends CardObject>(def: CardDef, owner: Player, zone: Zone<T>): T {
    return moveTestCard(new CardObject(new Card(def, owner)), zone);
}
