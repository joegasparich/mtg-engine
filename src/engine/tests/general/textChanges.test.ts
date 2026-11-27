import { AbilityPart_Landwalk } from "@engine/abilities/parts/AbilityPart_Landwalk";
import { replaceRulesWord } from "@engine/effects/TextChanges";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type { Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import { addTestCard } from "@engine/tests/testData";
import { BasicLandType,CardType } from "~/defs";
import { cardData } from "~/index";
import { renderRulesText,WordKind } from "~/rulesWords";

const { Forest, Island, Plains } = BasicLandType;
const layers = gameEventManager.effects.layers;
let player: Player;

beforeEach(() => {
    Game.init();
    player = game.addPlayer([]);
});

test("only marked words change, including repeated words, plurals and landwalk", () => {
    const template = "Island Sanctuary gives {land:Island:article} {land:Island:walk}. All {land:Island:plural} tap for {U}.";
    expect(renderRulesText(template, [{ kind: WordKind.BasicLandType, from: Island, to: Plains }]))
        .toBe("Island Sanctuary gives a Plains plainswalk. All Plains tap for {U}.");
});

test("colour substitutions compose in order and leave literal names, mana symbols and land words intact", () => {
    const template = "Red Ward gives protection from {color:R}. {color:R:capital} spells cost {R}. Fetch {land:Island:article}.";
    expect(renderRulesText(template, [
        { kind: WordKind.Colour, from: "R", to: "G" },
        { kind: WordKind.BasicLandType, from: Island, to: Forest },
        { kind: WordKind.Colour, from: "G", to: "U" },
    ])).toBe("Red Ward gives protection from blue. Blue spells cost {R}. Fetch a Forest.");
});

test("part fields and nested filters read the current word while slate keys and shared definitions stay literal", () => {
    const parts = {
        AbilityPart_Landwalk: { landType: Forest },
        AbilityPart_Target: { targetValidator: { cardSubtype: Forest }, saveAs: Forest },
    };
    const def = { ...cardData.find(card => card.name === "Grizzly Bears"), abilities: [{ parts }] };
    const edited = addTestCard(def, player, player.battlefield);
    const other = addTestCard(def, player, player.battlefield);
    const ability = edited.abilities[0];
    const walk = ability.parts.find(part => part instanceof AbilityPart_Landwalk);
    const filter = ability.targeter.targetValidator;

    const stop = layers.register({ select: () => [edited], changes: [replaceRulesWord({ kind: WordKind.BasicLandType, from: Forest, to: Island })] });
    expect(walk.landType).toBe(Island);
    expect(filter.cardSubtype).toBe(Island);
    expect(ability.targeter.saveAs).toBe(Forest);
    expect(other.abilities[0].targeter.targetValidator.cardSubtype).toBe(Forest);
    expect(parts.AbilityPart_Landwalk.landType).toBe(Forest);
    stop();
    expect(walk.landType).toBe(Forest);
    expect(filter.cardSubtype).toBe(Forest);
});

test("a static text effect reaches later permanents and can be removed independently of a resolved edit", () => {
    const def = cardData.find(card => card.name === "Lifetap");
    const obj = addTestCard(def, player, player.battlefield);
    const ability = obj.abilities[0];
    const select = () => player.battlefield.objects;
    const stop = layers.register({ select, changes: [replaceRulesWord({ kind: WordKind.BasicLandType, from: Forest, to: Island })] });
    layers.registerResolved({ select: () => [obj], changes: [replaceRulesWord({ kind: WordKind.BasicLandType, from: Island, to: Plains })] });
    const other = addTestCard(def, player, player.battlefield);
    expect(other.characteristics.rulesText).toContain("an Island");
    expect(obj.characteristics.rulesText).toContain("a Plains");
    expect(obj.abilities[0]).toBe(ability);
    expect(obj.copiableDefinition).toBe(def);
    stop();
    expect(obj.characteristics.rulesText).toBe(def.oracle_text);
    expect(other.characteristics.rulesText).toBe(def.oracle_text);
    expect(obj.abilities[0]).toBe(ability);
});

test("changing a spell's target restriction rechecks its original target on resolution", () => {
    const forest = addTestCard(cardData.find(card => card.name === Forest), player, player.battlefield);
    const island = addTestCard(cardData.find(card => card.name === Island), player, player.battlefield);
    const spellCard = addTestCard({
        ...cardData.find(card => card.name === "Disenchant"), types: [CardType.Instant],
        abilities: [{ parts: {
            AbilityPart_Target: { validTargets: ["Permanent"], targetValidator: { cardSubtype: Forest }, saveAs: "LAND" },
            AbilityPart_Effect_DestroyPermanents: { inSignal: "SPELL_RESOLVE", permanentsFrom: "LAND" },
        } }],
    }, player, player.hand);
    expect(game.stack.spellCast(player, spellCard, [forest])).toBe(true);
    const spell = game.stack.objects[0] as Spell;
    layers.registerResolved({ select: () => [spell], changes: [replaceRulesWord({ kind: WordKind.BasicLandType, from: Forest, to: Island })] });
    expect(spell.targets).toEqual([forest]);
    expect(spell.spellTargeter.validateTargets([forest])).toBe(false);
    expect(spell.spellTargeter.validateTargets([island])).toBe(true);
    game.stack.resolveAll();
    expect(player.battlefield.objects).toEqual([forest, island]);
    expect(player.graveyard.objects.map(obj => obj.card)).toContain(spellCard.card);
});

test("a whole-domain substitution merges duplicate land types and preserves other subtypes and printed abilities", () => {
    const land = addTestCard({ ...cardData.find(def => def.name === Forest), subtypes: ["Gate", Island, Forest],
        abilities: [{ parts: {} }] }, player, player.battlefield);
    const printed = land.abilities[0];
    const stop = layers.register({ select: () => [land], changes: [replaceRulesWord({ kind: WordKind.BasicLandType, to: Plains })] });
    expect(land.subtypes).toEqual(["Gate", Plains]);
    expect(land.abilities).toHaveLength(2);
    expect(land.abilities[0]).toBe(printed);
    stop();
    expect(land.subtypes).toEqual(["Gate", Island, Forest]);
    expect(land.abilities).toHaveLength(3);
});

test("a colour-setting spell resolves using its edited colour word", () => {
    const creature = addTestCard(cardData.find(def => def.name === "Grizzly Bears"), player, player.battlefield);
    const card = addTestCard(cardData.find(def => def.name === "Thoughtlace"), player, player.hand);
    expect(game.stack.spellCast(player, card, [creature])).toBe(true);
    const spell = game.stack.objects[0] as Spell;
    layers.registerResolved({ select: () => [spell], changes: [replaceRulesWord({ kind: WordKind.Colour, from: "U", to: "R" })] });
    expect(spell.characteristics.rulesText).toContain("becomes red");
    game.stack.resolveAll();
    expect(creature.colours).toEqual(new Set(["R"]));
});
