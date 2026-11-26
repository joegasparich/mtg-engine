import { selectObjectsFromZone } from "@engine/abilities/ZoneSelection";
import { GameEvent_DestroyPermanent,GameEvent_DrawCard,GameEvent_DrawCards } from "@engine/events";
import gameEventManager,{ type EventCheck } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { addTestCard,ANCESTRAL_RECALL,FOREST,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
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
