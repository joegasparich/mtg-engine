import { RulesEventType } from "@engine/events/RulesEvent";
import Card from "@engine/Card";
import { GameEvent_DrawCard,GameEvent_RegeneratePermanent,GameEvent_TapCard,GameEvent_UntapCard } from "@engine/events";
import { GameEvent_DeclareAttacker } from "@engine/events/GameEvent_CardInteractionChecks";
import { Permanent } from "@engine/GameObject";
import gameEventManager,{ type CheckSource,type EventCheck,type GameEvent,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { Keyword } from "~/defs";
import { cardData } from "~/index";

test("becomes-tapped listeners observe only actual tap transitions", () => {
    Game.init();
    const player = game.addPlayer([]);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const other = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const tap = new GameEvent_TapCard(creature);
    const regenerate = new GameEvent_RegeneratePermanent(other, vi.fn());
    const listener = vi.fn();
    const batch = vi.fn();
    gameEventManager.rules.onBatch(batch);
    gameEventManager.rules.on(RulesEventType.BecomesTapped, listener);
    const firstTap = { type: RulesEventType.BecomesTapped, permanent: creature };
    const secondTap = { type: RulesEventType.BecomesTapped, permanent: other };

    gameEventManager.performSimultaneous([tap, new GameEvent_TapCard(creature), regenerate]);
    expect(listener.mock.calls).toEqual([[firstTap], [secondTap]]);
    expect(batch).toHaveBeenCalledExactlyOnceWith([firstTap, secondTap]);

    gameEventManager.addEvent(new GameEvent_RegeneratePermanent(other, vi.fn()));
    expect(listener).toHaveBeenCalledTimes(2);
    gameEventManager.addEvent(new GameEvent_UntapCard(creature));
    const retap = new GameEvent_TapCard(creature);
    gameEventManager.addEvent(retap);
    expect(listener.mock.calls).toEqual([[firstTap], [secondTap], [firstTap]]);
});

test("a draw's nested zone move and a simultaneous tap reach observers together", () => {
    Game.init();
    const player = game.addPlayer([]);
    const top = addTestCard(cardData[GRIZZLY_BEARS], player, player.library);
    const permanent = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const batch = vi.fn(() => expect(permanent.tapped).toBe(true));
    gameEventManager.rules.onBatch(batch);

    gameEventManager.performSimultaneous([new GameEvent_DrawCard(player), new GameEvent_TapCard(permanent)]);

    expect(batch).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ type: RulesEventType.ZoneChanged, oldObject: top, oldZone: player.library,
            newObject: player.hand.objects[0], newZone: player.hand }),
        { type: RulesEventType.BecomesTapped, permanent },
    ]);
});

test("sequential taps publish separate batches and game subscriptions expire on reset", () => {
    Game.init();
    const player = game.addPlayer([]);
    const first = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const batch = vi.fn();
    const application = vi.fn();
    gameEventManager.rules.onBatch(batch);
    const stop = gameEventManager.rules.on(RulesEventType.BecomesTapped, application, { acrossGames: true });
    try {
        gameEventManager.addEvents([new GameEvent_TapCard(first), new GameEvent_TapCard(second)]);
        expect(batch.mock.calls).toEqual([
            [[{ type: RulesEventType.BecomesTapped, permanent: first }]],
            [[{ type: RulesEventType.BecomesTapped, permanent: second }]],
        ]);
        Game.init();
        const nextPlayer = game.addPlayer([]);
        const third = addTestCard(cardData[GRIZZLY_BEARS], nextPlayer, nextPlayer.battlefield);
        gameEventManager.addEvent(new GameEvent_TapCard(third));
        expect(batch).toHaveBeenCalledTimes(2);
        expect(application).toHaveBeenCalledTimes(3);
    } finally {
        stop();
    }
});

test("a one-shot game listener waits for a matching event and cancels before calling back", () => {
    Game.init();
    const skipped = new GameEvent_Log(GameEventType.Log, "Skip");
    const matching = new GameEvent_Log(GameEventType.Log, "Match");
    const callback = vi.fn(() => gameEventManager.performImmediate(matching));
    gameEventManager.onGamePerformed(GameEventType.Log, callback, {
        once: true,
        matches: event => event.label === matching.label,
    });

    gameEventManager.addEvent(skipped);
    expect(callback).not.toHaveBeenCalled();
    gameEventManager.addEvent(matching);
    expect(callback).toHaveBeenCalledExactlyOnceWith(matching);
});

test("a one-shot listener captures once per batch and fires for its first successful match", () => {
    Game.init();
    const skipped = new GameEvent_Log(GameEventType.Log, "Skip");
    const matching = new GameEvent_Log(GameEventType.Log, "Match");
    const rejected = new GameEvent_Log(GameEventType.Log, "Rejected match");
    rejected.perform = () => false;
    const captureBeforeBatch = vi.fn(() => "Before the batch");
    const callback = vi.fn();
    gameEventManager.onGamePerformed(GameEventType.Log, callback, {
        once: true,
        matches: event => event !== skipped,
        captureBeforeBatch,
    });

    gameEventManager.performSimultaneous([skipped, rejected, matching, new GameEvent_Log(GameEventType.Log, "Another match")]);

    expect(captureBeforeBatch).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith(matching, "Before the batch");
});

test("cancelled game listeners and listeners from a previous game do not observe events", () => {
    Game.init();
    const cancelled = vi.fn();
    const cancel = gameEventManager.onGamePerformed(GameEventType.Log, cancelled);
    cancel();
    cancel();
    const oldGameListener = vi.fn();
    const stopOldGameListener = gameEventManager.onGamePerformed(GameEventType.Log, oldGameListener);
    const applicationListener = vi.fn();
    gameEventManager.onPerformed(GameEventType.Log, applicationListener);
    const beforeReset = new GameEvent_Log(GameEventType.Log, "Before reset");
    const afterReset = new GameEvent_Log(GameEventType.Log, "After reset");
    try {
        gameEventManager.addEvent(beforeReset);
        Game.init();
        const newGameListener = vi.fn();
        const stopNewGameListener = gameEventManager.onGamePerformed(GameEventType.Log, newGameListener);
        stopOldGameListener();
        gameEventManager.addEvent(afterReset);
        stopNewGameListener();

        expect(cancelled).not.toHaveBeenCalled();
        expect(oldGameListener).toHaveBeenCalledExactlyOnceWith(beforeReset);
        expect(newGameListener).toHaveBeenCalledExactlyOnceWith(afterReset);
        expect(applicationListener.mock.calls).toEqual([[beforeReset], [afterReset]]);
    } finally {
        gameEventManager.offPerformed(GameEventType.Log, applicationListener);
    }
});

test("a game listener registered while observing a simultaneous batch sees only later events", () => {
    Game.init();
    const later = new GameEvent_Log(GameEventType.Log, "Later");
    const addedDuringDispatch = vi.fn();
    let cancel: () => void;
    gameEventManager.onGamePerformed(GameEventType.Log, () => {
        cancel = gameEventManager.onGamePerformed(GameEventType.Log, addedDuringDispatch);
    }, { once: true });

    gameEventManager.performSimultaneous([
        new GameEvent_Log(GameEventType.Log, "First"),
        new GameEvent_Log(GameEventType.Log, "Second"),
    ]);
    expect(addedDuringDispatch).not.toHaveBeenCalled();
    gameEventManager.addEvent(later);
    expect(addedDuringDispatch).toHaveBeenCalledExactlyOnceWith(later);
    cancel();
});

test.each(["queued", "immediate"])("event checks can replace a %s event and add another to the batch", execution => {
    const original = new GameEvent_Log(GameEventType.Log, "Original");
    const replacement = new GameEvent_Log(GameEventType.Log, "Replacement");
    const additional = new GameEvent_Log(GameEventType.Log, "Additional");
    const performed = vi.fn();
    replacement.then(() => performed(replacement));
    additional.then(() => performed(additional));
    original.then(() => performed(original));

    const change = (check: EventCheck) => {
        if (check.events.includes(original)) {
            check.replace(original, replacement);
            check.add(additional);
        }
    };
    gameEventManager.onCheck(change);
    try {
        expect(gameEventManager.checkEvent(original)).toBe(true);
        expect(performed).not.toHaveBeenCalled();
        if (execution === "queued")
            gameEventManager.addEvent(original);
        else
            expect(gameEventManager.performImmediate(original)).toBe(true);
        expect(performed.mock.calls).toEqual([[replacement], [additional]]);
    } finally {
        gameEventManager.offCheck(change);
    }
});

test("adding a separate event does not make a removed event pass its check", () => {
    const original = new GameEvent_Log(GameEventType.Log, "Original");
    const additional = new GameEvent_Log(GameEventType.Log, "Additional");
    const performOriginal = vi.spyOn(original, "perform");
    const performAdditional = vi.spyOn(additional, "perform");
    const change = (check: EventCheck) => {
        check.removeWhere(event => event === original);
        check.add(additional);
    };
    gameEventManager.onCheck(change);
    try {
        expect(gameEventManager.checkEvent(original)).toBe(false);
        expect(performAdditional).not.toHaveBeenCalled();
        expect(gameEventManager.performImmediate(original)).toBe(false);
        expect(performOriginal).not.toHaveBeenCalled();
        expect(performAdditional).toHaveBeenCalledTimes(1);
    } finally {
        gameEventManager.offCheck(change);
    }
});

test.each(["before", "after"])("overrides only the named check with a veto registered %s it", order => {
    Game.init();
    const player = game.addPlayer([]);
    const object = new Permanent(new Card(cardData[0], player), player);
    const declaration = new GameEvent_DeclareAttacker(object);
    const otherEvent = new GameEvent_Log(GameEventType.Log, "Other event");
    const otherDeclaration = new GameEvent_DeclareAttacker(object);
    const veto = (check: EventCheck) => check.removeWhere(event => event === declaration);
    const defender = (check: EventCheck) => check.removeWhere(event => event === declaration || event === otherDeclaration);
    const override = (event: GameEvent, source: CheckSource) =>
        event === declaration && source.object === object && source.keyword === Keyword.Defender;

    if (order === "before")
        gameEventManager.onCheck(veto);
    gameEventManager.withCheckSource({ object, keyword: Keyword.Defender }, () => gameEventManager.onCheck(defender));
    if (order === "after")
        gameEventManager.onCheck(veto);
    gameEventManager.onCheckRemovalOverride(override);

    try {
        expect(gameEventManager.checkEvent(declaration)).toBe(false);
        gameEventManager.offCheck(veto);
        const batch = [declaration, otherDeclaration, otherEvent];
        gameEventManager.checkForEffects(batch);
        expect(batch).toEqual([declaration, otherEvent]);
    } finally {
        gameEventManager.offCheck(veto);
        gameEventManager.offCheck(defender);
        gameEventManager.offCheckRemovalOverride(override);
    }
});
