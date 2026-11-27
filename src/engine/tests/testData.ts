import Card from "@engine/Card";
import { GameEvent_Advance,GameEvent_ChangeCardZone,GameEvent_GoToStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { CardObject } from "@engine/GameObject";
import type Player from "@engine/Player";
import type { Zone } from "@engine/Zone";
import { StepIndex } from "@engine/Step";
import type { CardDef } from "~/defs";
import { cardData } from "~/index";

export const FOREST = cardData.findIndex(c => c.name == "Forest");
export const MOUNTAIN = cardData.findIndex(c => c.name == "Mountain");
export const GRIZZLY_BEARS = cardData.findIndex(c => c.name == "Grizzly Bears");
export const MONS_GOBLIN_RAIDERS = cardData.findIndex(c => c.name == "Mons's Goblin Raiders");
export const AIR_ELEMENTAL = cardData.findIndex(c => c.name == "Air Elemental");
export const ANCESTRAL_RECALL = cardData.findIndex(c => c.name == "Ancestral Recall");

export const BASIC_DECK = [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS, GRIZZLY_BEARS];

export function startMainPhase() {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
}

export function passPriorityRound() {
    for (let count = 0; count < game.players.length; count++) {
        expect(game.priorityPlayer).toBeTruthy();
        gameEventManager.addEvent(new GameEvent_Advance());
    }
}

export function chooseEarliestTimestamps(player: Player, ...cards: CardObject[]) {
    for (const card of cards) {
        const choice = game.pendingResolutionChoice;
        expect(choice?.sourceName).toBe("Simultaneous timestamps");
        expect(choice.player).toBe(player);
        expect(choice.options).toContain(card);
        expect(new Set(choice.options).size).toBe(choice.options.length);
        choice.submit(player, [card]);
    }
}

export function moveTestCard<T extends CardObject>(object: CardObject, zone: Zone<T>): T {
    const event = new GameEvent_ChangeCardZone(object, zone);
    gameEventManager.addEvent(event);
    return event.newObject as T;
}

export function addTestCard<T extends CardObject>(def: CardDef, owner: Player, zone: Zone<T>): T {
    return moveTestCard(new CardObject(new Card(def, owner)), zone);
}
