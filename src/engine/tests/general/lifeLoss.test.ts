import { makeAbility } from "@engine/abilities";
import { LifeLossAmount } from "@engine/abilities/parts/effect/AbilityPart_Effect_LoseLife";
import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

test.each([
    [20, LifeLossAmount.HalfRoundedUp, 10],
    [19, LifeLossAmount.HalfRoundedUp, 9],
    [1, LifeLossAmount.HalfRoundedUp, 0],
    [0, LifeLossAmount.HalfRoundedUp, 0],
    [-3, LifeLossAmount.HalfRoundedUp, -3],
    [20, 3, 17],
])("life loss adjusts a life total of %i by %s to %i", (life, amount, expected) => {
    Game.init();
    const owner = game.addPlayer([]);
    const source = addTestCard(cardData[GRIZZLY_BEARS], owner, owner.hand);
    const ability = makeAbility({
        parts: { AbilityPart_Effect_LoseLife: { target: "THIS.owner", amount } },
    }, source);
    owner.life = life;

    ability.fireSignal("default");

    expect(owner.life).toBe(expected);
});
