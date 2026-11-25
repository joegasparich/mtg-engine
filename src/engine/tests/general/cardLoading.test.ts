import { AbilityPart_Attach } from "@engine/abilities/parts/AbilityPart_Attach";
import { AbilityPart_Aura } from "@engine/abilities/parts/AbilityPart_Aura";
import { AbilityPart_AuraTarget } from "@engine/abilities/parts/AbilityPart_AuraTarget";
import Card from "@engine/Card";
import { CardObject } from "@engine/GameObject";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { addTestCard,FOREST,GRIZZLY_BEARS } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("should load land correctly", () => {
    const def = cardData[FOREST];
    const object = new CardObject(new Card(def, player));

    expect(object.def).toBe(def);
    expect(object.name).toBe(def.name);
    expect(object.type).toBe(def.type);
    expect(object.subtypes).toEqual(["Forest"]);
    expect(object.cost).toBe(undefined);
    expect(object.abilities[0].def).toEqual(def.abilities[0]);

    expect(object.owner).toBe(player);
});

test("should load simple creature correctly", () => {
    const def = cardData[GRIZZLY_BEARS];
    const object = new CardObject(new Card(def, player));

    expect(object.def).toBe(def);
    expect(object.name).toBe(def.name);
    expect(object.type).toBe(def.type);
    expect(object.subtypes).toEqual(["Bear"]);
    expect(object.cost).toEqual([0, 0, 0, 0, 1, 0, 1]);
    expect(object.abilities).toEqual([]);
    expect(object.power).toBe(def.power);
    expect(object.toughness).toBe(def.toughness);

    expect(object.owner).toBe(player);
});

test("SimpleAura expands into three parts using one filter for targeting and attachment", () => {
    const opponent = game.addPlayer([]);
    const target = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const targetValidator = { cardType: CardType.Creature, cardSubtype: "Wall" };
    const shorthand = addTestCard({
        ...cardData.find(def => def.name === "Animate Wall"),
        abilities: [{ parts: { SimpleAura: { targetValidator } } }],
    }, player, player.hand);
    const parts = shorthand.abilities[0].parts;
    const targeting = parts.find(part => part instanceof AbilityPart_AuraTarget);
    const attachment = parts.find(part => part instanceof AbilityPart_Attach);
    const auraPart = parts.find(part => part instanceof AbilityPart_Aura);

    expect(parts).toHaveLength(3);
    expect(targeting.targetValidator).toBe(attachment.targetValidator);
    expect(targeting.saveAs).toBe(attachment.target);
    expect(attachment.saveAs).toBe(auraPart.attachmentFrom);
    expect(targeting.validateTargets([target])).toBe(false);

    target.subtypes = ["Wall"];
    expect(game.stack.spellCast(player, shorthand, [target])).toBe(true);
    game.stack.resolveAll();
    const attached = player.battlefield.objects.find(object => object.card === shorthand.card);
    expect(attached?.attachedTo).toBe(target);

    target.subtypes = [];
    game.checkState();
    expect(player.graveyard.objects.map(object => object.card)).toContain(shorthand.card);
});
