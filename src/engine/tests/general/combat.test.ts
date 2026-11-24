import { PlayerActions } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ChangeCardZone,GameEvent_GoToNextStep,GameEvent_GoToStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { AIR_ELEMENTAL,BASIC_DECK,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS } from "@engine/tests/testData";
import { cardData } from "~/index";

let playerA: Player;
let playerB: Player;

beforeEach(async () => {
    game?.reset();
    Game.init();
    game.players.length = 0;
    playerA = game.addPlayer(BASIC_DECK);
    playerB = game.addPlayer(BASIC_DECK);
});

test("should trade", () => {
    const bearsA = new Card(cardData[GRIZZLY_BEARS], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bearsA, playerA.battlefield));
    const bearsB = new Card(cardData[GRIZZLY_BEARS], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bearsB, playerB.battlefield));

    const bearsADestroyed = vi.spyOn(bearsA, "destroy");
    const bearsBDestroyed = vi.spyOn(bearsB, "destroy");

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bearsA).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(bearsA.tapped).toBe(true);
    (new PlayerActions.DeclareBlocker(bearsB).perform(playerB, [bearsA]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(bearsADestroyed).toBeCalledTimes(1);
    expect(bearsBDestroyed).toBeCalledTimes(1);
    expect(bearsA.zone).toBe(playerA.graveyard);
    expect(bearsB.zone).toBe(playerB.graveyard);
});

test("attacker should win", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, playerA.battlefield));
    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, playerB.battlefield));

    const bearsDestroyed = vi.spyOn(bears, "destroy");
    const goblinsDestroyed = vi.spyOn(goblins, "destroy");

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bears).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    (new PlayerActions.DeclareBlocker(goblins).perform(playerB, [bears]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(bearsDestroyed).toBeCalledTimes(0);
    expect(goblinsDestroyed).toBeCalledTimes(1);
    expect(bears.zone).toBe(playerA.battlefield);
    expect(goblins.zone).toBe(playerB.graveyard);
});

test("blocker should win", () => {
    const goblins = new Card(cardData[MONS_GOBLIN_RAIDERS], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(goblins, playerA.battlefield));
    const bears = new Card(cardData[GRIZZLY_BEARS], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, playerB.battlefield));

    const goblinsDestroyed = vi.spyOn(goblins, "destroy");
    const bearsDestroyed = vi.spyOn(bears, "destroy");

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(goblins).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    (new PlayerActions.DeclareBlocker(bears).perform(playerB, [goblins]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(goblinsDestroyed).toBeCalledTimes(1);
    expect(bearsDestroyed).toBeCalledTimes(0);
    expect(goblins.zone).toBe(playerA.graveyard);
    expect(bears.zone).toBe(playerB.battlefield);
});

test("flyer can't be blocked by non flyer", () => {
    const elemental = new Card(cardData[AIR_ELEMENTAL], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(elemental, playerA.battlefield));
    const bears = new Card(cardData[GRIZZLY_BEARS], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, playerB.battlefield));

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(elemental).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(bears, playerB, false).length).toBe(0);
});

test("non flyer can be blocked by flyer", () => {
    const bears = new Card(cardData[GRIZZLY_BEARS], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bears, playerA.battlefield));
    const elemental = new Card(cardData[AIR_ELEMENTAL], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(elemental, playerB.battlefield));

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bears).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(elemental, playerB, false).length).toBe(1);
});

test("flyer can be blocked by flyer", () => {
    const elementalA = new Card(cardData[AIR_ELEMENTAL], playerA);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(elementalA, playerA.battlefield));
    const elementalB = new Card(cardData[AIR_ELEMENTAL], playerB);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(elementalB, playerB.battlefield));

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(elementalA).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(elementalB, playerB, false).length).toBe(1);
});

test("can withdraw an attacker before confirming and only taps confirmed attackers", () => {
    const withdrawn = new Card(cardData[GRIZZLY_BEARS], playerA);
    const attacking = new Card(cardData[GRIZZLY_BEARS], playerA);
    for (const card of [withdrawn, attacking])
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, playerA.battlefield));

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    const edit = new PlayerActions.DeclareAttacker(withdrawn);
    const keep = new PlayerActions.DeclareAttacker(attacking);
    edit.perform(playerA);
    keep.perform(playerA);

    expect(edit.withdraw(playerB)).toBe(false);
    expect(edit.withdraw(playerA)).toBe(true);
    expect([...CombatManager.attackingCreatures.keys()]).toEqual([attacking]);
    expect(attacking.tapped).toBe(false);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(withdrawn.tapped).toBe(false);
    expect(attacking.tapped).toBe(true);
    expect(keep.withdraw(playerA)).toBe(false);
});

test("can reassign and withdraw a block while keeping the previous assignment after an illegal edit", () => {
    const first = new Card(cardData[GRIZZLY_BEARS], playerA);
    const second = new Card(cardData[GRIZZLY_BEARS], playerA);
    const flying = new Card(cardData[AIR_ELEMENTAL], playerA);
    const blocker = new Card(cardData[GRIZZLY_BEARS], playerB);
    const attackers = [first, second, flying];
    for (const card of [...attackers, blocker])
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(card, card.controller.battlefield));

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const card of attackers)
        new PlayerActions.DeclareAttacker(card).perform(playerA);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const edit = new PlayerActions.DeclareBlocker(blocker);
    edit.perform(playerB, [first]);
    edit.perform(playerB, [flying]);
    expect(CombatManager.blockingCreatures.get(blocker)).toBe(first);

    edit.perform(playerB, [second]);
    expect([...CombatManager.blockingCreatures]).toEqual([[blocker, second]]);
    expect(edit.withdraw(playerA)).toBe(false);
    expect(edit.withdraw(playerB)).toBe(true);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);

    edit.perform(playerB, [second]);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(second, playerA.graveyard));
    expect(CombatManager.attackingCreatures.has(second)).toBe(false);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);
    edit.perform(playerB, [second]);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);
});
