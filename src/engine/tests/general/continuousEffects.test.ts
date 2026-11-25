import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import { addTestCard,GRIZZLY_BEARS,moveTestCard,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { BasicLandType,CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

test("a static modifier reads a live selection from the slate until the ability is removed", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const bears = addTestCard(bearsDef, opponent, opponent.battlefield);
    const source = addTestCard({
        ...bearsDef,
        abilities: [{ parts: {
            AbilityPart_ModifyPowerToughness: {
                permanentsFrom: "TAPPED_BEARS",
                power: 1,
                toughness: 3,
            },
            AbilityPart_SelectObjectsFromZoneContinuously: {
                saveAs: "TAPPED_BEARS",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Creature, cardSubtype: "Bear", tapped: true },
            },
        } }],
    }, player, player.battlefield);
    const { slate } = source.abilities[0];
    const departingBear = addTestCard(bearsDef, player, player.battlefield);

    expect(slate.TAPPED_BEARS).toEqual([]);
    expect(bears.power).toBe(2);
    bears.tapped = true;
    expect(bears.power).toBe(3);
    expect(bears.toughness).toBe(5);
    expect(slate.TAPPED_BEARS).toEqual([bears]);

    bears.subtypes = [];
    expect(slate.TAPPED_BEARS).toEqual([]);
    expect(bears.power).toBe(2);
    bears.subtypes = bearsDef.subtypes;

    departingBear.tapped = true;
    expect(slate.TAPPED_BEARS).toHaveLength(2);
    expect(departingBear.toughness).toBe(5);
    expect(moveTestCard(departingBear, player.hand).toughness).toBe(2);
    expect(slate.TAPPED_BEARS).toEqual([bears]);

    source.abilities = [];
    expect(slate).not.toHaveProperty("TAPPED_BEARS");
    expect(bears.power).toBe(2);
    expect(bears.toughness).toBe(2);
});

test("the tapped filter matches only permanents in the requested state", () => {
    Game.init();
    const player = game.addPlayer([]);
    const def = cardData[GRIZZLY_BEARS];
    const inHand = addTestCard(def, player, player.hand);
    const permanent = addTestCard(def, player, player.battlefield);

    expect(matchesTargetValidator(inHand, { tapped: false })).toBe(false);
    expect(matchesTargetValidator(permanent, { tapped: false })).toBe(true);
    expect(matchesTargetValidator(permanent, { tapped: true })).toBe(false);
    permanent.tapped = true;
    expect(matchesTargetValidator(permanent, { tapped: false })).toBe(false);
    expect(matchesTargetValidator(permanent, { tapped: true })).toBe(true);
    expect(matchesTargetValidator(permanent, {})).toBe(true);
});

test("setting a basic land type suppresses native abilities and leaves grants active", () => {
    Game.init();
    const player = game.addPlayer([]);
    startMainPhase();
    const mountain = cardData.find(card => card.name === "Mountain");
    const grantSource = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const land = addTestCard({
        ...mountain,
        name: "Test land",
        subtypes: [BasicLandType.Mountain, BasicLandType.Forest],
        abilities: [{ parts: { AbilityPart_Trigger_Enters: { type: CardType.Creature } } }],
    }, player, player.battlefield);
    const [printed, mountainMana, forestMana] = land.abilities;
    // Banding registers an event check that also reads the source's effective abilities.
    const grant = land.grantAbility({ keyword: Keyword.Banding, parts: {} }, grantSource);
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        type: CardType.Enchantment,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZoneContinuously: {
                saveAs: "MOUNTAINS",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Land, baseSubtype: BasicLandType.Mountain },
            },
            AbilityPart_GiveBasicLandType: { landsFrom: "MOUNTAINS", landType: BasicLandType.Island },
        } }],
    }, player, player.battlefield);

    expect(source.abilities[0].slate.MOUNTAINS).toEqual([land]);
    expect(matchesTargetValidator(land, { cardType: CardType.Land, baseSubtype: BasicLandType.Mountain })).toBe(true);
    expect(matchesTargetValidator(land, { cardType: CardType.Land, cardSubtype: BasicLandType.Mountain })).toBe(false);
    expect(land.subtypes).toEqual([BasicLandType.Island]);
    expect(land.abilities).toHaveLength(2);
    expect(land.abilities[0].getPotentialMana()[ManaColour.U]).toBe(1);
    expect(land.abilities[1]).toBe(grant.ability);
    addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    expect(game.stack.objects).toHaveLength(0);

    moveTestCard(source, player.graveyard);
    expect(land.subtypes).toEqual([BasicLandType.Mountain, BasicLandType.Forest]);
    expect(land.abilities).toEqual([printed, mountainMana, forestMana, grant.ability]);
    addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects[0]).toMatchObject({ source: land });
});
