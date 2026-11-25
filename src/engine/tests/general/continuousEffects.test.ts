import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
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
