import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

test.each(["TARGET.controller", "TARGET.power", "TARGET"])("ReadValue snapshots %s when signalled", value => {
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
    ability.slate.TARGET = [target];
    const expected = value === "TARGET" ? target : value === "TARGET.controller" ? opponent : 0;

    ability.fireSignal("READ");
    target.controller = player;
    target.power = 3;
    expect(ability.slate.SAVED).toHaveLength(1);
    expect(ability.slate.SAVED[0]).toBe(expected);

    ability.slate.TARGET = [];
    ability.fireSignal("READ");
    expect(ability.slate.SAVED).toEqual([]);
});
