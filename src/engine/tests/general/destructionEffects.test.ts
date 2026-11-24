import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import gameEventManager,{ type EventCheck } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

test("a filtered destruction effect checks its whole batch and uses each permanent's owner", () => {
    Game.init();
    const caster = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const wall = cardData.find(card => card.name === "Wall of Swords");
    const protectedWall = addTestCard(wall, caster, caster.battlefield);
    const wallInHand = addTestCard(wall, caster, caster.hand);
    const controlledByOpponent = new GameEvent_ChangeCardZone(wallInHand, opponent.battlefield, { controller: opponent });
    gameEventManager.addEvent(controlledByOpponent);
    const otherCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const spell = addTestCard({
        name: "Destroy all Walls",
        image_url: "",
        oracle_text: "Destroy all Walls.",
        type: CardType.Sorcery,
        cost: "{1}",
        power: 0,
        toughness: 0,
        abilities: [{ parts: {
            AbilityPart_SelectPermanents: {
                inSignal: "SPELL_RESOLVE",
                saveAs: "WALLS",
                targetValidator: { cardType: CardType.Creature, cardSubtype: "Wall" },
                outSignal: "DESTROY_WALLS",
            },
            AbilityPart_Effect_DestroyPermanents: { inSignal: "DESTROY_WALLS", permanentsFrom: "WALLS" },
        } }],
    }, caster, caster.hand);

    const checkedDestruction = vi.fn((check: EventCheck) => {
        const destruction = check.events.filter(event => event instanceof GameEvent_DestroyPermanent);
        if (destruction.length) {
            expect(new Set(destruction.map(event => event.permanent)))
                .toEqual(new Set([protectedWall, controlledByOpponent.newObject]));
            check.removeWhere(event => event instanceof GameEvent_DestroyPermanent && event.permanent === protectedWall);
        }
    });
    gameEventManager.onCheck(checkedDestruction);
    try {
        expect(game.stack.spellCast(caster, spell)).toBe(true);
        game.stack.resolveAll();

        expect(caster.battlefield.objects).toEqual([protectedWall]);
        expect(opponent.battlefield.objects).toEqual([otherCreature]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([wallInHand.card, spell.card]);
        expect(opponent.graveyard.objects).toHaveLength(0);
    } finally {
        gameEventManager.offCheck(checkedDestruction);
    }
});
