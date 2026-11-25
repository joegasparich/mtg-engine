import { selectObjectsFromZone } from "@engine/abilities/ZoneSelection";
import Game,{ game } from "@engine/Game";
import { StackAbility } from "@engine/GameObject";
import { addTestCard,FOREST,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
import { cardData } from "~/index";

test("a signalled selection stores a snapshot of matching cards in the chosen player's hand", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const matchingCard = addTestCard(creature, opponent, opponent.hand);
    addTestCard(cardData[FOREST], opponent, opponent.hand);
    addTestCard(creature, player, player.hand);
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZone: {
                inSignal: "SELECT",
                saveAs: "CHOSEN",
                zone: ZoneKind.Hand,
                zoneOf: "PLAYER",
                targetValidator: { cardType: CardType.Creature },
            },
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;

    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([]);
    ability.slate.PLAYER = [opponent];
    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([matchingCard]);

    moveTestCard(matchingCard, opponent.graveyard);
    expect(ability.slate.CHOSEN).toEqual([matchingCard]);
    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([]);
});

test("a live graveyard selection sees cards from every player enter and leave", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZoneContinuously: {
                saveAs: "GRAVEYARD_CARDS",
                zone: ZoneKind.Graveyard,
            },
        } }],
    }, player, player.battlefield);
    const { slate } = source.abilities[0];
    expect(slate.GRAVEYARD_CARDS).toEqual([]);

    const ownCard = addTestCard(creature, player, player.graveyard);
    const opposingCard = addTestCard(cardData[FOREST], opponent, opponent.graveyard);
    expect(slate.GRAVEYARD_CARDS).toEqual([ownCard, opposingCard]);

    moveTestCard(ownCard, player.library);
    expect(slate.GRAVEYARD_CARDS).toEqual([opposingCard]);
});

test("selection from the shared stack supports spells and stack abilities", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const card = addTestCard(creature, player, player.hand);
    const source = addTestCard({ ...creature, abilities: [{ parts: {} }] }, opponent, opponent.battlefield);
    const [ability] = source.abilities;
    expect(game.stack.spellCast(player, card)).toBe(true);
    const [spell] = game.stack.objects;
    const stackAbility = new StackAbility(opponent, source, ability, "unused");
    game.stack.onEnter(stackAbility);

    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack })).toEqual([spell, stackAbility]);
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack, controlledBy: "THIS.controller" })).toEqual([stackAbility]);
    expect(selectObjectsFromZone(ability, {
        zone: ZoneKind.Stack, targetValidator: { cardType: CardType.Creature },
    })).toEqual([spell]);
});
