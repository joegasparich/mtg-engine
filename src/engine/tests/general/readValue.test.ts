import { resolveAbilityGrammar } from "@engine/abilities";
import Game,{ game } from "@engine/Game";
import { Spell } from "@engine/GameObject";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

test("chosenX belongs to each individual spell on the stack", () => {
    Game.init();
    const player = game.addPlayer([]);
    const def = {
        ...cardData[GRIZZLY_BEARS], cost: "{X}{G}",
        abilities: [{ parts: {} }],
    };
    for (const x of [0, 3]) {
        const card = addTestCard(def, player, player.hand);
        expect(resolveAbilityGrammar("THIS.chosenX", card.abilities[0])).toBeUndefined();
        expect(game.stack.spellCast(player, card, [], x)).toBe(true);
    }
    const values = game.stack.objects.filter(object => object instanceof Spell)
        .map(spell => resolveAbilityGrammar("THIS.chosenX", spell.abilities[0]));
    expect(values).toEqual([0, 3]);
});

test.each(["TARGET.controller", "TARGET.power", "TARGET.toughness", "TARGET"] as const)("ReadValue snapshots %s when signalled", value => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_ReadValue: { inSignal: "READ", value, saveAs: "SAVED" } } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    const target = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    target.power = 0;
    target.toughness = 4;
    ability.slate.TARGET = [target];
    const expectedValues = { TARGET: target, "TARGET.controller": opponent, "TARGET.power": 0, "TARGET.toughness": 4 };

    ability.fireSignal("READ");
    target.controller = player;
    target.power = 3;
    target.toughness = 1;
    expect(ability.slate.SAVED).toHaveLength(1);
    expect(ability.slate.SAVED[0]).toBe(expectedValues[value]);

    ability.slate.TARGET = [];
    ability.fireSignal("READ");
    expect(ability.slate.SAVED).toEqual([]);
});
