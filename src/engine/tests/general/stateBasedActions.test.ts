import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent,GameEvent_GoToStep,GameEvent_StepStart } from "@engine/events";
import gameEventManager,{ type EventCheck,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { type CardObject,Spell,StackAbility } from "@engine/GameObject";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,FOREST,GRIZZLY_BEARS,passPriorityRound } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

beforeEach(() => Game.init());

test("zero toughness and lethal damage are processed together outside combat", () => {
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const zero = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const lethal = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const onMove = vi.fn(() => {
        expect(player.graveyard.objects.map(object => object.card)).toEqual([zero.card]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([lethal.card]);
    });
    const onDestroy = vi.fn();
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onMove);
    gameEventManager.onPerformed(GameEventType.DestroyPermanent, onDestroy);
    try {
        const changeState = new GameEvent_Log(GameEventType.Log, "Change toughness and mark damage");
        changeState.then(() => {
            zero.toughness = 0;
            lethal.damageTaken = lethal.toughness;
        });
        gameEventManager.addEvent(changeState);
        expect(onMove).toHaveBeenCalledTimes(2);
        expect(onDestroy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ permanent: lethal }));
    } finally {
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onMove);
        gameEventManager.offPerformed(GameEventType.DestroyPermanent, onDestroy);
    }
});

test("a prevented destruction leaves a lethal creature in play without repeating the batch", () => {
    const player = game.addPlayer([]);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const prevented = vi.fn();
    const preventDestruction = (check: EventCheck) => {
        if (check.removeWhere(event => event instanceof GameEvent_DestroyPermanent && event.permanent === creature))
            prevented();
    };
    gameEventManager.onCheck(preventDestruction);
    try {
        creature.damageTaken = creature.toughness;
        game.checkState();
        expect(prevented).toHaveBeenCalledTimes(1);
        expect(creature.zone).toBe(player.battlefield);
    } finally {
        gameEventManager.offCheck(preventDestruction);
    }
});

test("a temporary zero toughness during spell resolution does not remove a creature", () => {
    const player = game.addPlayer([FOREST, FOREST, FOREST]);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], player, player.hand);
    expect(game.stack.spellCast(player, recall, [player])).toBe(true);
    expect(game.stack.objects[0]).toBeInstanceOf(Spell);

    const afterDraw = () => {
        creature.toughness = 0;
        const restore = new GameEvent_Log(GameEventType.Log, "Restore toughness before resolution finishes");
        restore.then(() => { creature.toughness = creature.def.toughness; });
        gameEventManager.addEvent(restore);
    };
    gameEventManager.onPerformed(GameEventType.DrawCard, afterDraw);
    try {
        game.stack.resolveAll();
        expect(creature.zone).toBe(player.battlefield);
        expect(creature.toughness).toBe(creature.def.toughness);
        expect(player.hand.objects).toHaveLength(3);
    } finally {
        gameEventManager.offPerformed(GameEventType.DrawCard, afterDraw);
    }
});

test("a host and its Aura are dealt with before a waiting trigger is put on the stack", () => {
    const player = game.addPlayer([FOREST]);
    const host = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const aura = addTestCard(cardData.find(def => def.name === "Animate Wall"), player, player.hand);
    // Use the actual Aura with a Wall as its host.
    host.subtypes = ["Wall"];
    expect(game.stack.spellCast(player, aura, [host])).toBe(true);
    game.stack.resolveAll();
    const attached = player.battlefield.objects.find(permanent => permanent.card === aura.card);
    expect(attached.attachedTo).toBe(host);

    addTestCard({
        ...cardData[FOREST],
        types: [CardType.Enchantment],
        abilities: [{ parts: {
            AbilityPart_Trigger_Enters: { type: CardType.Creature, outSignal: "DRAW" },
            AbilityPart_Effect_DrawCards: { inSignal: "DRAW", target: "CONTROLLER", count: 1 },
        } }],
    }, player, player.battlefield);
    const incoming = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    const enter = new GameEvent_ChangeCardZone(incoming, player.battlefield);
    const observeZoneChange = (event: GameEvent_ChangeCardZone) => {
        if (event.newZone === player.graveyard) {
            expect(game.stack.objects).toHaveLength(0);
            removed.push(event.oldObject);
        }
    };
    const removed: CardObject[] = [];
    enter.then(() => {
        host.damageTaken = host.toughness;
        gameEventManager.onIdle(() => {
            expect(removed).toEqual([host, attached]);
            expect(game.stack.objects[0]).toBeInstanceOf(StackAbility);
        });
    });
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, observeZoneChange);
    try {
        gameEventManager.addEvent(enter);
        expect(removed).toEqual([host, attached]);
        game.stack.resolveAll();
        expect(player.hand.objects).toHaveLength(1);
    } finally {
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, observeZoneChange);
    }
});

test("cleanup checks state-based actions after removing marked damage", () => {
    const player = game.addPlayer([]);
    const doomed = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const survivor = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
    expect(game.currentStepIndex).toBe(StepIndex.End);

    const lowerToughnessDuringCleanup = (event: GameEvent_StepStart) => {
        if (event.stepIndex === StepIndex.Cleanup)
            doomed.toughness = 0;
    };
    gameEventManager.onPerformed(GameEventType.StepStart, lowerToughnessDuringCleanup);
    try {
        survivor.damageTaken = 1;
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(game.currentStepIndex).toBe(StepIndex.Cleanup);
        expect(player.battlefield.objects).toEqual([survivor]);
        expect(survivor.damageTaken).toBe(0);
        expect(game.priorityPlayer).toBe(player);
        passPriorityRound();
        expect(game.currentStepIndex).toBe(StepIndex.Cleanup);
        expect(game.priorityPlayer).toBeNull();
    } finally {
        gameEventManager.offPerformed(GameEventType.StepStart, lowerToughnessDuringCleanup);
    }
});
