import { RulesEventType } from "@engine/events/RulesEvent";
import { selectObjectsFromZone } from "@engine/abilities/ZoneSelection";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent,GameEvent_DrawCard,GameEvent_DrawCards,GameEvent_GoToNextTurn,GameEvent_GoToStep,OptionalDecision } from "@engine/events";
import gameEventManager,{ type EventCheck } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,FOREST,GRIZZLY_BEARS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should add card to library", () => {
    const forest = addTestCard(cardData[FOREST], player, player.library);

    expect(player.library.objects.length).toBe(1);
    expect(player.library.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.library);
});

test("should add card to hand", () => {
    const forest = addTestCard(cardData[FOREST], player, player.hand);

    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.hand);
});

test("should add card to battlefield", () => {
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);

    expect(player.battlefield.objects.length).toBe(1);
    expect(player.battlefield.objects[0]).toBe(forest);
    expect(forest.zone).toBe(player.battlefield);
});

test("changing control preserves the permanent and its pending battlefield departure", () => {
    const opponent = game.addPlayer([]);
    const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
    const destroy = new GameEvent_DestroyPermanent(land);
    const moves = vi.fn();
    gameEventManager.rules.on(RulesEventType.ZoneChanged, moves);

    land.controller = player;
    expect(moves).not.toHaveBeenCalled();
    expect(opponent.battlefield.objects).toEqual([]);
    expect(player.battlefield.objects).toEqual([land]);
    expect(land.zone).toBe(player.battlefield);
    expect(land.getPotentialMana(player)).toContain(1);
    expect(land.getPotentialMana(opponent)).not.toContain(1);

    gameEventManager.addEvent(destroy);
    expect(moves).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        oldZone: player.battlefield, newZone: opponent.graveyard, cause: destroy,
    }));
    expect(player.battlefield.objects).toEqual([]);
    expect(opponent.graveyard.objects[0].card).toBe(land.card);
});

test("should draw card from library", () => {
    const forest = addTestCard(cardData[FOREST], player, player.library);

    gameEventManager.addEvent(new GameEvent_DrawCard(player));

    expect(player.library.objects.length).toBe(0);
    expect(player.hand.objects.length).toBe(1);
    expect(player.hand.objects[0].card).toBe(forest.card);
    expect(forest.retired).toBe(true);
});

test("a draw instruction can be changed before its individual draws are checked", () => {
    const bottom = addTestCard(cardData[FOREST], player, player.library);
    const middle = addTestCard(cardData[FOREST], player, player.library);
    const top = addTestCard(cardData[GRIZZLY_BEARS], player, player.library);
    const libraryTops: (typeof top)[] = [];
    const replaceDraws = (check: EventCheck) => {
        for (const event of check.events) {
            if (event instanceof GameEvent_DrawCards) {
                check.replace(event, new GameEvent_DrawCards(player, 3));
            } else if (event instanceof GameEvent_DrawCard) {
                libraryTops.push(player.library.getTopCard());
                if (libraryTops.length === 2)
                    check.removeWhere(candidate => candidate === event);
            }
        }
    };
    gameEventManager.onCheck(replaceDraws);
    try {
        gameEventManager.addEvent(new GameEvent_DrawCards(player, 2));
    } finally {
        gameEventManager.offCheck(replaceDraws);
    }

    expect(libraryTops).toEqual([top, middle, middle]);
    expect(player.hand.objects.map(object => object.card)).toEqual([top.card, middle.card]);
    expect(player.library.objects).toEqual([bottom]);
});

test("should go to graveyard when destroyed", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(bears));

    expect(player.battlefield.objects.length).toBe(0);
    expect(player.graveyard.objects.length).toBe(1);
    expect(player.graveyard.objects[0].card).toBe(bears.card);
    expect(bears.retired).toBe(true);
});

test("drawing uses the saved player selection and skips an empty selection", () => {
    const opponent = game.addPlayer([]);
    const source = addTestCard({ ...cardData[GRIZZLY_BEARS], abilities: [{ parts: {
        AbilityPart_SelectPlayers: { inSignal: "SELECT", target: "CREATURE.controller", saveAs: "PLAYERS" },
        AbilityPart_Effect_DrawCards: { inSignal: "DRAW", playersFrom: "PLAYERS" },
    } }] }, player, player.battlefield);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const top = addTestCard(cardData[FOREST], opponent, opponent.library);
    addTestCard(cardData[FOREST], player, player.library);
    const [ability] = source.abilities;
    ability.slate.CREATURE = [creature];
    ability.fireSignal("SELECT");
    ability.slate.CREATURE = [];
    ability.fireSignal("DRAW");
    expect(opponent.hand.objects.map(card => card.card)).toEqual([top.card]);

    ability.fireSignal("SELECT");
    expect(ability.slate.PLAYERS).toEqual([]);
    ability.fireSignal("DRAW");
    expect(player.hand.objects).toHaveLength(0);
});

test("each player's draws wait for the active player's draw replacement choices", () => {
    const active = game.addPlayer([]);
    startMainPhase();
    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Draw));
    expect(game.currentTurnPlayer()).toBe(active);
    addTestCard(cardData.find(card => card.name === "Island Sanctuary"), active, active.battlefield);
    for (const recipient of game.players) {
        addTestCard(cardData[FOREST], recipient, recipient.library);
        addTestCard(cardData[FOREST], recipient, recipient.library);
    }
    const spell = addTestCard({ ...cardData[ANCESTRAL_RECALL], abilities: [{ parts: {
        AbilityPart_SelectPlayers: { inSignal: "SPELL_RESOLVE", saveAs: "PLAYERS", outSignal: "DRAW" },
        AbilityPart_Effect_DrawCards: { inSignal: "DRAW", playersFrom: "PLAYERS", count: 2 },
    } }] }, player, player.hand);
    expect(game.stack.spellCast(player, spell)).toBe(true);
    passPriorityRound();

    expect(game.pendingOptionalChoice?.player).toBe(active);
    expect(player.hand.objects).toHaveLength(0);
    game.pendingOptionalChoice.submit(active, OptionalDecision.Decline);
    expect(active.hand.objects).toHaveLength(1);
    expect(game.pendingOptionalChoice?.player).toBe(active);
    expect(player.hand.objects).toHaveLength(0);
    game.pendingOptionalChoice.submit(active, OptionalDecision.Accept);
    expect(active.hand.objects).toHaveLength(1);
    expect(player.hand.objects).toHaveLength(2);
    expect(game.stack.objects).toHaveLength(0);
});

test("moving cards to libraries and shuffling can resolve independently", () => {
    const opponent = game.addPlayer([]);
    const source = addTestCard({ ...cardData[GRIZZLY_BEARS], abilities: [{ parts: {
        AbilityPart_SelectObjects: { inSignal: "SELECT", zone: ZoneKind.Hand, saveAs: "CARDS" },
        AbilityPart_Effect_ChangeZones: { inSignal: "MOVE", target: "CARDS", destination: ZoneKind.Library },
        AbilityPart_SelectPlayers: { inSignal: "SELECT_PLAYER", target: "THIS.controller", saveAs: "PLAYERS", outSignal: "SHUFFLE" },
        AbilityPart_Effect_ShuffleLibrary: { inSignal: "SHUFFLE", playersFrom: "PLAYERS" },
    } }] }, player, player.battlefield);
    const card = addTestCard(cardData[FOREST], player, player.hand);
    const shuffle = vi.spyOn(player.library, "shuffle");
    const opponentShuffle = vi.spyOn(opponent.library, "shuffle");

    source.abilities[0].fireSignal("SHUFFLE");
    expect(shuffle).not.toHaveBeenCalled();
    source.abilities[0].fireSignal("SELECT_PLAYER");
    expect(shuffle).toHaveBeenCalledTimes(1);
    expect(opponentShuffle).not.toHaveBeenCalled();
    expect(card.zone).toBe(player.hand);

    source.abilities[0].fireSignal("SELECT");
    const laterCard = addTestCard(cardData[FOREST], player, player.hand);
    source.abilities[0].fireSignal("MOVE");
    expect(player.hand.objects).toEqual([laterCard]);
    expect(player.library.getTopCard().card).toBe(card.card);
    expect(shuffle).toHaveBeenCalledTimes(1);
});

test("shuffling a zone into libraries still shuffles when it is empty or its move is prevented", () => {
    const opponent = game.addPlayer([]);
    const card = addTestCard(cardData[FOREST], opponent, opponent.graveyard);
    const source = addTestCard({ ...cardData[GRIZZLY_BEARS], abilities: [{ parts: {
        AbilityPart_SelectObjects: { zone: ZoneKind.Graveyard, saveAs: "CARDS", outSignal: "MOVE" },
        AbilityPart_Effect_ChangeZones: { inSignal: "MOVE", target: "CARDS", destination: ZoneKind.Library, outSignal: "SELECT_PLAYERS" },
        AbilityPart_SelectPlayers: { inSignal: "SELECT_PLAYERS", saveAs: "PLAYERS", outSignal: "SHUFFLE" },
        AbilityPart_Effect_ShuffleLibrary: { inSignal: "SHUFFLE", playersFrom: "PLAYERS" },
    } }] }, player, player.battlefield);
    const shuffles = game.players.map(p => vi.spyOn(p.library, "shuffle"));
    const preventMove = (check: EventCheck) => check.removeWhere(event =>
        event instanceof GameEvent_ChangeCardZone && event.oldObject === card);
    gameEventManager.onCheck(preventMove);
    try {
        source.abilities[0].fireSignal("default");
    } finally {
        gameEventManager.offCheck(preventMove);
    }
    expect(opponent.graveyard.objects).toEqual([card]);
    for (const shuffle of shuffles)
        expect(shuffle).toHaveBeenCalledTimes(1);
});

test.each([ZoneKind.Hand, ZoneKind.Library, ZoneKind.Graveyard] as const)("a zone change effect moves a permanent to its owner's %s", destination => {
    const opponent = game.addPlayer([]);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    bears.controller = player;
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_Effect_ChangeZones: { target: "CHOSEN", destination } } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    ability.slate.CHOSEN = [bears];

    ability.fireSignal("default");

    expect(bears.retired).toBe(true);
    expect(player[destination].objects).toEqual([]);
    expect(opponent[destination].objects).toEqual([expect.objectContaining({ card: bears.card })]);
});

test("moving a spell from the stack to its owner's graveyard skips its effects", () => {
    const opponent = game.addPlayer([]);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
    const topCard = addTestCard(cardData[FOREST], opponent, opponent.library);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    expect(game.stack.spellCast(player, bears)).toBe(true);
    expect(game.stack.spellCast(opponent, recall, [opponent])).toBe(true);

    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_Effect_ChangeZones: { target: "SPELL", destination: ZoneKind.Graveyard } } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    ability.slate.SPELL = [game.stack.objects.at(-1)];
    // 701.6a: The removed spell never resolves. Other spells still resolve normally.
    ability.fireSignal("default");
    game.stack.resolveAll();

    expect(opponent.graveyard.objects.map(object => object.card)).toEqual([recall.card]);
    expect(opponent.library.objects).toEqual([topCard]);
    expect(player.battlefield.objects.map(object => object.card)).toContain(bears.card);
});

test("a zone change can read the enchanted permanent through a property reference", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const flight = cardData.find(def => def.name === "Flight");
    const card = addTestCard({ ...flight, abilities: [...flight.abilities, { parts: {
        AbilityPart_Effect_ChangeZones: { inSignal: "RETURN", target: "THIS.attachedTo", destination: ZoneKind.Hand },
    } }] }, player, player.hand);
    expect(game.stack.spellCast(player, card, [bears])).toBe(true);
    game.stack.resolveAll();
    const aura = player.battlefield.objects.find(object => object.card === card.card);
    aura.abilities.at(-1).fireSignal("RETURN");
    expect(player.hand.objects.map(object => object.card)).toEqual([bears.card]);
});

test("a battlefield zone change effect can put a land onto the battlefield from a hand", () => {
    const opponent = game.addPlayer([]);
    const forest = addTestCard(cardData[FOREST], opponent, opponent.hand);
    const instant = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_Effect_ChangeZones: { target: "CHOSEN", destination: ZoneKind.Battlefield },
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    ability.slate.CHOSEN = [instant];
    ability.fireSignal("default");
    ability.slate.CHOSEN = [forest];
    ability.fireSignal("default");

    expect(opponent.hand.objects).toEqual([instant]);
    expect(player.battlefield.objects).toEqual([source, expect.objectContaining({ card: forest.card, controller: player })]);
});

test("exile holds fresh card objects from every player and allows them to change zones again", () => {
    const opponent = game.addPlayer([]);
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_Effect_ChangeZones: { target: "CHOSEN", destination: ZoneKind.Exile } } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    const own = addTestCard(cardData[FOREST], player, player.hand);
    const opposing = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    for (const object of [own, opposing]) {
        ability.slate.CHOSEN = [object];
        ability.fireSignal("default");
        expect(object.retired).toBe(true);
    }

    const [land, creature] = game.exile.objects;
    expect(land.card).toBe(own.card);
    expect(creature.card).toBe(opposing.card);
    expect(creature.controller).toBeUndefined();
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Exile })).toEqual([land, creature]);

    const returned = moveTestCard(creature, opponent.hand);
    expect(creature.retired).toBe(true);
    expect(returned.card).toBe(opposing.card);
    expect(game.exile.objects).toEqual([land]);
});
