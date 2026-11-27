import { RulesEventType,type ZoneChanged } from "@engine/events/RulesEvent";
import { Ability } from "@engine/abilities";
import { AbilityPart } from "@engine/abilities/parts/AbilityPart";
import { AbilityParts } from "@engine/abilities/registry";
import { GameEvent_ChangeCardZone,OptionalDecision } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type { Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
import { cardData } from "~/index";

const bears = cardData[GRIZZLY_BEARS];
// A printed toughness of two lets an unmodified copier survive a declined choice.
const copier = { ...bears, abilities: cardData.find(card => card.name === "Clone").abilities };
let player: Player;

beforeEach(() => {
    Game.init();
    player = game.addPlayer([]);
});

test("entry previews are side-effect free and simultaneous choices see only existing permanents", () => {
    const original = addTestCard(bears, player, player.battlefield);
    const first = addTestCard(copier, player, player.hand);
    const second = addTestCard(copier, player, player.hand);
    const moves = [first, second].map(object => new GameEvent_ChangeCardZone(object, player.battlefield));
    expect(gameEventManager.checkEvent(moves[0])).toBe(true);
    expect(game.hasPendingPlayerInput).toBe(false);
    const observe = vi.fn(() => expect(player.battlefield.objects).toHaveLength(3));
    gameEventManager.rules.on(RulesEventType.ZoneChanged, observe);
    gameEventManager.performSimultaneous(moves);
    for (const move of moves) {
        expect(move.newObject).toBeUndefined();
        expect(player.hand.objects).toEqual([first, second]);
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        expect(game.pendingResolutionChoice.options).toEqual([original]);
        game.pendingResolutionChoice.submit(player, [original]);
    }
    expect(observe).not.toHaveBeenCalled();
    game.pendingResolutionChoice.submit(player, [second]);
    expect(moves[1].newObject.timestamp).toBeLessThan(moves[0].newObject.timestamp);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(moves.map(move => move.newObject.name)).toEqual([bears.name, bears.name]);
});

test("copying an unmodified copier offers its newly acquired entry replacement once", () => {
    const original = addTestCard(bears, player, player.battlefield);
    addTestCard(copier, player, player.battlefield);
    game.pendingOptionalChoice.submit(player, OptionalDecision.Decline);
    const blank = player.battlefield.objects.at(-1);
    addTestCard(copier, player, player.battlefield);
    for (const choice of [blank, original]) {
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        game.pendingResolutionChoice.submit(player, [choice]);
    }
    const copy = player.battlefield.objects.at(-1);
    expect(copy.def).toBe(bears);
    expect(copy.card.def).toBe(copier);
    expect(copy.abilities).toHaveLength(0);
    expect(game.hasPendingPlayerInput).toBe(false);
});

test("a copied entry replacement applies before observers and the copied enters trigger fires once", () => {
    class EnterTapped extends AbilityPart {
        replaceEntry(entering: Permanent, resume: () => void) {
            entering.tapped = true;
            resume();
        }
    }
    AbilityParts.EnterTapped = EnterTapped;
    try {
        const original = addTestCard({ ...bears, abilities: [{ parts: { EnterTapped: {} } }, { parts: {
            AbilityPart_Trigger_Enters: { type: CardType.Creature },
            AbilityPart_Effect_GainLife: { target: "THIS.controller", amount: 1 },
        } }] }, player, player.battlefield);
        game.stack.resolveAll();
        original.tapped = false;
        const life = player.life;
        const incoming = addTestCard(copier, player, player.hand);
        const observe = vi.fn((event: ZoneChanged) => {
            expect(event.newObject).toMatchObject({ tapped: true, name: original.name });
        });
        gameEventManager.rules.on(RulesEventType.ZoneChanged, observe, { matches: event => event.oldObject === incoming });
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(incoming, player.battlefield));
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        game.pendingResolutionChoice.submit(player, [original]);
        expect(observe).toHaveBeenCalledOnce();
        expect(game.stack.objects).toHaveLength(2);
        game.stack.resolveAll();
        expect(player.life).toBe(life + 2);
    } finally {
        delete AbilityParts.EnterTapped;
    }
});

test("simultaneous entrants' controllers choose in turn order while other events wait", () => {
    const opponent = game.addPlayer([]);
    game.startGame();
    const active = game.currentTurnPlayer();
    const other = active === player ? opponent : player;
    const original = addTestCard(bears, player, player.battlefield);
    const moves = [other, active].map(controller => {
        const card = addTestCard(copier, controller, controller.hand);
        return new GameEvent_ChangeCardZone(card, controller.battlefield);
    });
    const leave = new GameEvent_ChangeCardZone(original, player.graveyard);
    gameEventManager.performSimultaneous(moves);
    gameEventManager.addEvent(leave);
    for (const chooser of [active, other]) {
        expect(game.pendingOptionalChoice.player).toBe(chooser);
        game.pendingOptionalChoice.submit(chooser, OptionalDecision.Accept);
        expect(game.pendingResolutionChoice.options).toEqual([original]);
        expect(leave.newObject).toBeUndefined();
        game.pendingResolutionChoice.submit(chooser, [original]);
    }
    expect(moves.every(move => move.newObject?.def === bears)).toBe(true);
    expect(leave.newObject.zone).toBe(player.graveyard);
});

test("entry can copy a permanent supplied by a different slate producer", () => {
    const original = addTestCard(bears, player, player.battlefield);
    const copy = addTestCard({ ...bears, name: "Test copier", abilities: [{ parts: {
        AbilityPart_SelectObjects: {
            inSignal: "SELECT", zone: ZoneKind.Battlefield, saveAs: "PERMANENTS", outSignal: "READY",
        },
        AbilityPart_EnterAsCopy: { outSignal: "SELECT", inSignal: "READY", copyFrom: "PERMANENTS" },
    } }] }, player, player.battlefield);
    expect(copy.isCopy).toBe(true);
    expect(copy.def).toBe(original.def);
    expect(game.hasPendingPlayerInput).toBe(false);
});

test("later copies inherit an added type without duplicating it or changing the printed face", () => {
    const artifactCreature = { ...bears, types: [CardType.Artifact, CardType.Creature] };
    let original = addTestCard(artifactCreature, player, player.battlefield);
    for (const name of ["Copy Artifact", "Copy Artifact", "Clone"]) {
        const card = addTestCard(cardData.find(def => def.name === name), player, player.hand);
        const move = new GameEvent_ChangeCardZone(card, player.battlefield);
        gameEventManager.addEvent(move);
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        game.pendingResolutionChoice.submit(player, [original]);
        const copy = player.battlefield.objects.at(-1);
        expect(copy.card).toBe(card.card);
        expect(copy.printedFace).toBe(artifactCreature);
        expect(copy.types).toEqual([CardType.Artifact, CardType.Creature, CardType.Enchantment]);
        expect(copy.power).toBe(artifactCreature.power);
        original = copy;
    }
    expect(artifactCreature.types).toEqual([CardType.Artifact, CardType.Creature]);
});

test("a copy exception sets characteristics once for the chosen copy and later copies inherit the result", () => {
    const parts = copier.abilities[0].parts;
    const modified = { ...bears, abilities: [{ parts: {
        ...parts,
        AbilityPart_EnterAsCopy: {
            ...parts.AbilityPart_EnterAsCopy, modify: { signal: "ADJUST", saveAs: "RESULT" },
        },
        AbilityPart_ModifyCardDefinition: {
            inSignal: "ADJUST", on: "RESULT",
            addTypes: [CardType.Enchantment], powerToughness: { power: 3, toughness: 4 },
        },
    } }] };
    const original = addTestCard(bears, player, player.battlefield);
    const signals = vi.spyOn(Ability.prototype, "fireSignal");
    try {
        addTestCard(modified, player, player.battlefield);
        game.pendingOptionalChoice.submit(player, OptionalDecision.Decline);
        expect(signals).not.toHaveBeenCalledWith("ADJUST");
        expect(player.battlefield.objects.at(-1)).toMatchObject({ power: 2, toughness: 2, types: [CardType.Creature] });

        addTestCard(modified, player, player.battlefield);
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        game.pendingResolutionChoice.submit(player, [original]);
        const copy = player.battlefield.objects.at(-1);
        expect(copy).toMatchObject({ power: 3, toughness: 4, types: [CardType.Creature, CardType.Enchantment] });
        expect(copy.printedFace).toBe(bears);
        expect(original).toMatchObject({ power: 2, toughness: 2, types: [CardType.Creature] });
        expect(original.def).toMatchObject({ power: 2, toughness: 2, types: [CardType.Creature] });

        addTestCard(copier, player, player.battlefield);
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        game.pendingResolutionChoice.submit(player, [copy]);
        expect(player.battlefield.objects.at(-1).def).toBe(copy.def);
        expect(signals.mock.calls.filter(([signal]) => signal === "ADJUST")).toHaveLength(1);
    } finally {
        signals.mockRestore();
    }
});

test("an ordinary entry ability can modify characteristics using its own signal and slate key", () => {
    class SetEntryTypes extends AbilityPart {
        replaceEntry(entering: Permanent, resume: () => void) {
            const draft = { ...entering.def };
            this.ability.slate.OTHER = [draft];
            this.ability.fireSignal("SET_TYPES");
            expect(draft.types).toBe(entering.def.types);
            this.ability.slate.ENTRY = [draft];
            this.ability.fireSignal("UNRELATED");
            expect(draft.types).toBe(entering.def.types);
            this.ability.fireSignal("SET_TYPES");
            entering.types = draft.types;
            resume();
        }
    }
    AbilityParts.SetEntryTypes = SetEntryTypes;
    try {
        const printed = { ...bears, abilities: [{ parts: {
            SetEntryTypes: {},
            AbilityPart_ModifyCardDefinition: { inSignal: "SET_TYPES", on: "ENTRY", addTypes: [CardType.Artifact] },
        } }] };
        const permanent = addTestCard(printed, player, player.battlefield);
        expect(permanent.isCopy).toBe(false);
        expect(permanent.types).toEqual([CardType.Creature, CardType.Artifact]);
        expect(permanent.def).toBe(printed);
        expect(printed.types).toEqual([CardType.Creature]);
    } finally {
        delete AbilityParts.SetEntryTypes;
    }
});
