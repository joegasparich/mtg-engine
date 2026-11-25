import playerActionManager from "@engine/actions/PlayerActionManager";
import {
    GameEvent_ActivateAbility,GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_DestroyPermanent,
    GameEvent_DiscardCard,GameEvent_GoToStep,GameEvent_PlayLand,GameEvent_SacrificePermanent,
} from "@engine/events";
import gameEventManager,{ type EventCheck,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { Spell,StackAbility } from "@engine/GameObject";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,FOREST,GRIZZLY_BEARS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

const forest = cardData[FOREST];
const bears = cardData[GRIZZLY_BEARS];
const equalize = {
    AbilityPart_Effect_EqualizeCards: {
        inSignal: "SPELL_RESOLVE",
        phases: [{ action: "sacrifice", cardType: "Land" }, { action: "discard" }],
    },
};
const testSpell = { ...forest, type: CardType.Sorcery, abilities: [{ parts: equalize }] };

function lands(player: Player, count: number) {
    return Array.from({ length: count }, () => addTestCard(forest, player, player.battlefield));
}

function hand(player: Player, count: number) {
    return Array.from({ length: count }, () => addTestCard(forest, player, player.hand));
}

beforeEach(() => Game.init());

test("collects multiplayer choices in turn order and commits each batch simultaneously", () => {
    const caster = game.addPlayer([]);
    const active = game.addPlayer([]);
    const next = game.addPlayer([]);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    game.currentTurnPlayerID = active.id;
    const [casterLand] = lands(caster, 2);
    const activeLands = lands(active, 4);
    const nextLands = lands(next, 3);
    const [casterLandInHand] = hand(caster, 1);
    const [activeDiscard, activeKeep] = hand(active, 2);
    const [nextDiscard, nextKeep] = hand(next, 2);
    const source = addTestCard({ ...testSpell, type: CardType.Instant }, caster, caster.hand);
    const otherSpell = addTestCard({ ...testSpell, abilities: [] }, caster, caster.hand);
    const stale = addTestCard(forest, active, active.hand);
    moveTestCard(stale, active.library);

    const onSacrifice = vi.fn(() => {
        expect(active.battlefield.objects).toEqual(activeLands.slice(0, 2));
        expect(next.battlefield.objects).toEqual(nextLands.slice(0, 2));
        expect(game.stack.objects[0]).toBeInstanceOf(Spell);
    });
    const onDiscard = vi.fn(() => {
        expect(active.hand.objects).toEqual([activeKeep]);
        expect(next.hand.objects).toEqual([nextKeep]);
    });
    gameEventManager.onPerformed(GameEventType.SacrificePermanent, onSacrifice);
    gameEventManager.onPerformed(GameEventType.DiscardCard, onDiscard);
    try {
        // Deliberately resolve a spell controlled by a player other than the active player.
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, source));
        passPriorityRound();
        const first = game.pendingResolutionChoice;
        expect(first).toMatchObject({ player: active, options: activeLands, count: 2, visibility: "public", earlierChoices: [] });

        first.submit(next, activeLands.slice(0, 2));
        first.submit(active, []);
        first.submit(active, [activeLands[0], activeLands[0]]);
        first.submit(active, [activeLands[0], nextLands[0]]);
        first.submit(active, [activeLands[0], stale]);
        expect(game.pendingResolutionChoice).toBe(first);
        expect(game.nextStep(false)).toBe(false);
        expect(playerActionManager.getAvailableActions(caster).size).toBe(0);
        const activation = new GameEvent_ActivateAbility(caster, casterLand, casterLand.abilities[0]);
        gameEventManager.addEvents([
            new GameEvent_CastSpell(caster, otherSpell), new GameEvent_PlayLand(caster, casterLandInHand), activation,
        ]);
        expect(activation.permanent.tapped).toBe(false);
        expect(casterLandInHand.zone).toBe(caster.hand);
        expect(otherSpell.zone).toBe(caster.hand);

        // Remove the other spell fixture from hand so both excess hands have a choice.
        moveTestCard(otherSpell, caster.library);
        first.submit(active, activeLands.slice(0, 2));
        const second = game.pendingResolutionChoice;
        expect(second).toMatchObject({ player: next, earlierChoices: [{ player: active, cards: activeLands.slice(0, 2) }] });
        first.submit(active, activeLands.slice(1, 3));
        expect(game.pendingResolutionChoice).toBe(second);
        expect(onSacrifice).not.toHaveBeenCalled();
        second.submit(next, nextLands.slice(0, 2));
        expect(onSacrifice).toHaveBeenCalledTimes(3);

        const privateFirst = game.pendingResolutionChoice;
        expect(privateFirst).toMatchObject({ player: active, visibility: "private", options: [activeDiscard, activeKeep] });
        privateFirst.submit(active, [activeDiscard]);
        const privateSecond = game.pendingResolutionChoice;
        expect(privateSecond).toMatchObject({ player: next, visibility: "private", options: [nextDiscard, nextKeep] });
        expect(privateSecond).not.toHaveProperty("earlierChoices");
        expect(active.hand.objects).toEqual([activeDiscard, activeKeep]);
        expect(onDiscard).not.toHaveBeenCalled();
        privateSecond.submit(next, [nextDiscard]);

        expect(onDiscard).toHaveBeenCalledTimes(2);
        expect(game.pendingResolutionChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(card => card.card)).toEqual([source.card]);
    } finally {
        gameEventManager.offPerformed(GameEventType.SacrificePermanent, onSacrifice);
        gameEventManager.offPerformed(GameEventType.DiscardCard, onDiscard);
    }
});

test("defers state-based actions and waiting triggers until the paused spell finishes", () => {
    const caster = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();
    const [sacrificed] = lands(caster, 1);
    const doomed = addTestCard(bears, caster, caster.battlefield);
    const [discarded, kept] = hand(caster, 2);
    const triggerDraw = addTestCard(forest, caster, caster.library);
    hand(opponent, 1);
    const source = addTestCard(testSpell, caster, caster.hand);
    const watcher = addTestCard({
        ...bears, abilities: [{ parts: { AbilityPart_Effect_DrawCards: { inSignal: "DRAW", target: "CONTROLLER", count: 1 } } }],
    }, caster, caster.battlefield);

    const onSacrifice = () => {
        doomed.toughness = 0;
        game.stack.abilityTriggered(caster, watcher.abilities[0], "DRAW", {});
    };
    gameEventManager.onPerformed(GameEventType.SacrificePermanent, onSacrifice);
    try {
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, source));
        passPriorityRound();
        expect(game.pendingResolutionChoice?.options).toEqual([discarded, kept]);
        expect(game.stack.objects).toEqual([expect.objectContaining({ card: source.card })]);
        expect(doomed.zone).toBe(caster.battlefield);
        expect(caster.library.objects).toEqual([triggerDraw]);

        game.pendingResolutionChoice.submit(caster, [discarded]);
        expect(game.stack.objects).toEqual([expect.any(StackAbility)]);
        passPriorityRound();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(card => card.card)).toEqual([sacrificed.card, discarded.card, source.card, doomed.card]);
        expect(caster.hand.objects.map(card => card.card)).toEqual([kept.card, triggerDraw.card]);
    } finally {
        gameEventManager.offPerformed(GameEventType.SacrificePermanent, onSacrifice);
    }
});

test("a stack ability can also wait for a required choice", () => {
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();
    const [discarded, kept] = hand(player, 2);
    hand(opponent, 1);
    const source = addTestCard({
        ...bears,
        abilities: [{ parts: {
            AbilityPart_Activate_Tap: {},
            AbilityPart_Effect_EqualizeCards: { phases: [{ action: "discard" }] },
        } }],
    }, player, player.battlefield);

    gameEventManager.addEvent(new GameEvent_ActivateAbility(player, source, source.abilities[0]));
    expect(game.stack.objects).toEqual([expect.any(StackAbility)]);
    expect(source.tapped).toBe(true);
    passPriorityRound();
    game.pendingResolutionChoice.submit(player, [discarded]);

    expect(game.stack.objects).toHaveLength(0);
    expect(player.hand.objects).toEqual([kept]);
    expect(player.graveyard.objects.map(card => card.card)).toEqual([discarded.card]);
});

test("sacrifice uses the controller, moves to the owner's graveyard, and bypasses destruction checks", () => {
    const owner = game.addPlayer([]);
    const controller = game.addPlayer([]);
    const [inHand] = hand(owner, 1);
    const move = new GameEvent_ChangeCardZone(inHand, controller.battlefield, { controller });
    gameEventManager.addEvent(move);
    const permanent = controller.battlefield.objects[0];
    const preventDestroy = (check: EventCheck) => {
        check.removeWhere(event => event instanceof GameEvent_DestroyPermanent);
    };
    const onChange = vi.fn();
    const onDestroy = vi.fn();
    gameEventManager.onCheck(preventDestroy);
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onChange);
    gameEventManager.onPerformed(GameEventType.DestroyPermanent, onDestroy);
    try {
        expect(gameEventManager.performImmediate(new GameEvent_DestroyPermanent(permanent))).toBe(false);
        expect(gameEventManager.performImmediate(new GameEvent_DiscardCard(owner, permanent))).toBe(false);
        expect(gameEventManager.performImmediate(new GameEvent_SacrificePermanent(owner, permanent))).toBe(false);

        const sacrifice = new GameEvent_SacrificePermanent(controller, permanent);
        expect(gameEventManager.performImmediate(sacrifice)).toBe(true);
        expect(permanent.retired).toBe(true);
        expect(owner.graveyard.objects).toEqual([sacrifice.newObject]);
        expect(sacrifice.newObject.card).toBe(inHand.card);
        expect(onChange).toHaveBeenCalledExactlyOnceWith(sacrifice);
        expect(onDestroy).not.toHaveBeenCalled();
    } finally {
        gameEventManager.offCheck(preventDestroy);
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onChange);
        gameEventManager.offPerformed(GameEventType.DestroyPermanent, onDestroy);
    }
});
