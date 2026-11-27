import { RulesEventType,type ZoneChanged } from "@engine/events/RulesEvent";
import { makeAbility } from "@engine/abilities";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { modifyPowerToughness } from "@engine/effects/PowerToughness";
import { GameEvent_DeclareAttacker } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { Permanent } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import { addTestCard,GRIZZLY_BEARS,moveTestCard,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { BasicLandType,CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

test("control and permission to attack with defender follow a live selection of multiple permanents", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const wall = cardData.find(card => card.name === "Wall of Swords");
    const first = addTestCard(wall, opponent, opponent.battlefield);
    const canDeclare = (creature: Permanent) => gameEventManager.checkEvent(new GameEvent_DeclareAttacker(creature));
    expect(canDeclare(first)).toBe(false);

    const source = addTestCard({ ...cardData[GRIZZLY_BEARS], abilities: [{ parts: {
        AbilityPart_SelectObjectsContinuously: {
            zone: ZoneKind.Battlefield, targetValidator: { cardSubtype: "Wall" }, saveAs: "WALLS",
        },
        AbilityPart_ControlPermanents: { permanentsFrom: "WALLS" },
        AbilityPart_CanAttackWithDefender: { permanentsFrom: "WALLS" },
    } }] }, player, player.battlefield);
    const second = addTestCard(wall, opponent, opponent.battlefield);
    for (const creature of [first, second]) {
        expect(creature.controller).toBe(player);
        expect(creature.hasKeyword(Keyword.Defender)).toBe(true);
        expect(canDeclare(creature)).toBe(true);
    }

    first.subtypes = [];
    expect(first.controller).toBe(opponent);
    expect(canDeclare(first)).toBe(false);
    expect(second.controller).toBe(player);
    expect(canDeclare(second)).toBe(true);
    moveTestCard(source, player.graveyard);
    expect(second.controller).toBe(opponent);
    expect(canDeclare(second)).toBe(false);
});

test("an attack restriction follows the attacker referenced by the slate", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const bears = cardData[GRIZZLY_BEARS];
    const source = addTestCard({ ...bears, abilities: [{ parts: {
        AbilityPart_AttackRequiresDefenderPermanent: { attacker: "MARKED", targetValidator: { cardType: CardType.Land } },
    } }] }, player, player.battlefield);
    const other = addTestCard(bears, player, player.battlefield);
    const canAttack = (creature: Permanent) => gameEventManager.checkEvent(new GameEvent_DeclareAttacker(creature, opponent));
    const { slate } = source.abilities[0];
    slate.MARKED = [other];
    expect(canAttack(other)).toBe(false);
    expect(canAttack(source)).toBe(true);
    slate.MARKED = [source];
    expect(canAttack(other)).toBe(true);
    expect(canAttack(source)).toBe(false);
    delete slate.MARKED;
    expect(canAttack(source)).toBe(true);
});

test("a continuous object selection resolves its configured reference on each read", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const inHand = addTestCard({
        ...bearsDef,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: { target: "MARKED", saveAs: "SELECTED" },
        } }],
    }, player, player.hand);
    expect(inHand.abilities[0].slate).not.toHaveProperty("SELECTED");

    const source = moveTestCard(inHand, player.battlefield);
    const other = addTestCard(bearsDef, player, player.battlefield);
    const { slate } = source.abilities[0];
    expect(slate.SELECTED).toEqual([]);

    slate.MARKED = [source];
    expect(slate.SELECTED).toEqual([source]);
    slate.MARKED = [other];
    expect(slate.SELECTED).toEqual([other]);
    delete slate.MARKED;
    expect(slate.SELECTED).toEqual([]);

    moveTestCard(source, player.graveyard);
    expect(slate).not.toHaveProperty("SELECTED");
});

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
            AbilityPart_SelectObjectsContinuously: {
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

test("a continuous zone selection filters by current colour alongside card type", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...bearsDef,
        types: [CardType.Enchantment],
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: {
                saveAs: "GREEN_CREATURES",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Creature, colour: "G" },
            },
        } }],
    }, player, player.battlefield);
    const { slate } = source.abilities[0];
    expect(slate.GREEN_CREATURES).toEqual([]);

    const bears = addTestCard(bearsDef, player, player.battlefield);
    const multicoloured = addTestCard({ ...bearsDef, cost: "{G}{U}" }, player, player.battlefield);
    addTestCard({ ...bearsDef, cost: "{2}" }, player, player.battlefield);
    expect(slate.GREEN_CREATURES).toEqual([bears, multicoloured]);
    bears.colours = new Set(["U"]);
    expect(slate.GREEN_CREATURES).toEqual([multicoloured]);

    moveTestCard(source, player.graveyard);
    expect(slate).not.toHaveProperty("GREEN_CREATURES");
});

test("setting an object's colour updates colour-dependent ability grants", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...bearsDef,
        types: [CardType.Enchantment],
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: {
                saveAs: "BLUE_CREATURES",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Creature, colour: "U" },
            },
            AbilityPart_GrantAbilityContinuously: {
                permanentsFrom: "BLUE_CREATURES",
                grant: { keyword: Keyword.Flying },
            },
        } }],
    }, player, player.battlefield);
    const creature = addTestCard({ ...bearsDef, cost: "{2}" }, player, player.battlefield);
    expect(creature.colours.size).toBe(0);
    expect(creature.hasKeyword(Keyword.Flying)).toBe(false);

    for (const [colour, shouldFly] of [["U", true], ["B", false]] as const) {
        const ability = makeAbility({ parts: { AbilityPart_Effect_SetColour: { target: "RECIPIENT", colour } } }, source);
        ability.slate.RECIPIENT = [creature];
        ability.fireSignal("default");
        expect(creature.colours).toEqual(new Set([colour]));
        expect(creature.hasKeyword(Keyword.Flying)).toBe(shouldFly);
    }
});

test("a continuous zone selection can exclude its source across all battlefields", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const sourceDef = {
        ...bearsDef,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: {
                saveAs: "OTHER_CREATURES",
                zone: ZoneKind.Battlefield,
                excludeSource: true,
                targetValidator: { cardType: CardType.Creature },
            },
        } }],
    };
    const source = addTestCard(sourceDef, player, player.battlefield);
    const other = addTestCard(sourceDef, opponent, opponent.battlefield);

    expect(source.abilities[0].slate.OTHER_CREATURES).toEqual([other]);
    expect(other.abilities[0].slate.OTHER_CREATURES).toEqual([source]);
});

test("a continuous grant follows battlefield membership and card types before entry is announced", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const observeEntry = vi.fn((event: ZoneChanged) => {
        expect(event.newObject).toBeInstanceOf(Permanent);
        expect(event.newObject.hasKeyword(Keyword.Flying)).toBe(true);
    });
    gameEventManager.rules.on(RulesEventType.ZoneChanged, observeEntry, {
        matches: event => event.newZone === player.battlefield && event.oldObject.def === bearsDef,
    });
    const source = addTestCard({
        ...bearsDef,
        types: [CardType.Enchantment],
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: {
                saveAs: "CREATURES",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Creature },
            },
            AbilityPart_GrantAbilityContinuously: {
                permanentsFrom: "CREATURES",
                saveAs: "GRANTED_FLIGHT",
                grant: { keyword: Keyword.Flying },
            },
        } }],
    }, player, player.battlefield);
    const { slate } = source.abilities[0];
    expect(slate).not.toHaveProperty("GRANTED_FLIGHT");
    const bears = addTestCard(bearsDef, player, player.battlefield);
    expect(observeEntry).toHaveBeenCalledOnce();
    const [granted] = bears.abilities;
    expect(granted.grantedBy).toBe(source);
    expect(slate.GRANTED_FLIGHT[0]).toBe(granted);

    const other = addTestCard(bearsDef, player, player.battlefield);
    expect(slate.GRANTED_FLIGHT).toHaveLength(2);
    expect(slate.GRANTED_FLIGHT[0]).toBe(granted);
    expect(slate.GRANTED_FLIGHT[1]).toBe(other.abilities[0]);
    bears.types = [CardType.Artifact];
    expect(bears.hasKeyword(Keyword.Flying)).toBe(false);
    expect(slate.GRANTED_FLIGHT).toHaveLength(1);
    expect(slate.GRANTED_FLIGHT[0]).toBe(other.abilities[0]);
    bears.types = [CardType.Creature];
    expect(bears.hasKeyword(Keyword.Flying)).toBe(true);
    expect(moveTestCard(other, player.graveyard).hasKeyword(Keyword.Flying)).toBe(false);

    source.abilities = [];
    expect(bears.hasKeyword(Keyword.Flying)).toBe(false);
    expect(slate).not.toHaveProperty("GRANTED_FLIGHT");
});

test("ability grants and stat modifiers accept the same fixed list of recipients", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bearsDef = cardData[GRIZZLY_BEARS];
    const first = addTestCard(bearsDef, player, player.battlefield);
    const second = addTestCard(bearsDef, player, player.battlefield);
    const other = addTestCard(bearsDef, player, player.battlefield);
    const ability = makeAbility({ parts: {} }, other);
    const recipients = [first, second];
    const endGrant = gameEventManager.effects.startContinuous(ability, {
        kind: ContinuousEffectKind.AbilityGrant,
        recipients,
        grant: { keyword: Keyword.Flying, parts: {} },
    });
    const endModifier = gameEventManager.effects.startContinuous(ability, modifyPowerToughness(recipients, 1, 2));

    recipients[1] = other;
    for (const creature of [first, second]) {
        expect(creature.hasKeyword(Keyword.Flying)).toBe(true);
        expect(creature).toMatchObject({ power: 3, toughness: 4 });
    }
    expect(other.hasKeyword(Keyword.Flying)).toBe(false);
    expect(other).toMatchObject({ power: 2, toughness: 2 });

    endGrant();
    endModifier();
    for (const creature of [first, second]) {
        expect(creature.hasKeyword(Keyword.Flying)).toBe(false);
        expect(creature).toMatchObject({ power: 2, toughness: 2 });
    }
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
        types: [CardType.Enchantment],
        abilities: [{ parts: {
            AbilityPart_SelectObjectsContinuously: {
                saveAs: "MOUNTAINS",
                zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Land, baseSubtype: BasicLandType.Mountain },
            },
            AbilityPart_SetBasicLandType: { landsFrom: "MOUNTAINS", landType: BasicLandType.Island },
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

test.each([true, false])("animation and basic land type changes compose and expire independently (Conversion first: %s)", conversionFirst => {
    Game.init();
    const player = game.addPlayer([]);
    startMainPhase();
    const prism = cardData.find(card => card.name === "Celestial Prism");
    const land = addTestCard({
        ...prism, types: [CardType.Artifact, CardType.Land], subtypes: ["Equipment", BasicLandType.Mountain],
    }, player, player.battlefield);
    const originalAbilities = land.abilities;
    const conversion = cardData.find(card => card.name === "Conversion");
    const aura = addTestCard(cardData.find(card => card.name === "Animate Artifact"), player, player.hand);
    const addConversion = () => addTestCard(conversion, player, player.battlefield);
    let converter = conversionFirst ? addConversion() : undefined;
    expect(game.stack.spellCast(player, aura, [land])).toBe(true);
    game.stack.resolveAll();
    const animation = player.battlefield.objects.find(object => object.card === aura.card);
    converter ??= addConversion();

    expect(land.types).toEqual([CardType.Artifact, CardType.Land, CardType.Creature]);
    expect(land).toMatchObject({ subtypes: ["Equipment", BasicLandType.Plains], power: 3, toughness: 3 });
    expect(land.abilities).toHaveLength(1);
    expect(land.abilities[0].getPotentialMana()[ManaColour.W]).toBe(1);

    if (conversionFirst) {
        moveTestCard(converter, player.graveyard);
        expect(land).toMatchObject({ power: 3, toughness: 3, subtypes: ["Equipment", BasicLandType.Mountain] });
        expect(land.abilities).toEqual(originalAbilities);
        moveTestCard(animation, player.graveyard);
    } else {
        moveTestCard(animation, player.graveyard);
        expect(land.hasType(CardType.Creature)).toBe(false);
        expect(land.subtypes).toEqual(["Equipment", BasicLandType.Plains]);
        moveTestCard(converter, player.graveyard);
    }
    expect(land.types).toEqual(land.def.types);
    expect(land.subtypes).toEqual(land.def.subtypes);
    expect(land.abilities).toEqual(originalAbilities);
});

test.each([true, false])("Crusade boosts an animated white artifact after its base P/T is set (Crusade first: %s)", crusadeFirst => {
    Game.init();
    const player = game.addPlayer([]);
    startMainPhase();
    const prism = cardData.find(card => card.name === "Celestial Prism");
    const artifact = addTestCard({ ...prism, cost: "{2}{W}" }, player, player.battlefield);
    const crusadeDef = cardData.find(card => card.name === "Crusade");
    const addCrusade = () => addTestCard(crusadeDef, player, player.battlefield);
    let crusade = crusadeFirst ? addCrusade() : undefined;

    const aura = addTestCard(cardData.find(card => card.name === "Animate Artifact"), player, player.hand);
    expect(game.stack.spellCast(player, aura, [artifact])).toBe(true);
    game.stack.resolveAll();
    crusade ??= addCrusade();

    expect(artifact.characteristics).toMatchObject({ basePower: 3, baseToughness: 3 });
    expect(artifact.getPowerToughness()).toEqual({ power: 4, toughness: 4 });
    moveTestCard(crusade, player.graveyard);
    expect(artifact).toMatchObject({ power: 3, toughness: 3 });
});
