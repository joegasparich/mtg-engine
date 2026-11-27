import { makeAbility } from "@engine/abilities";
import { GameEvent_TapCard } from "@engine/events/GameEvent_TapCard";
import gameEventManager from "@engine/events/GameEventManager";
import { RulesEventType } from "@engine/events/RulesEvent";
import Game,{ game } from "@engine/Game";
import { type Permanent,StackAbility } from "@engine/GameObject";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { cardData } from "~/index";

test("each tap trigger stores its own permanent when two permanents tap simultaneously", () => {
    Game.init();
    const player = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const first = addTestCard(creature, player, player.battlefield);
    const second = addTestCard(creature, player, player.battlefield);
    addTestCard({ ...creature, abilities: [{ parts: {
        AbilityPart_Trigger_BecomesTapped: { storeAs: "TAPPED" },
    } }] }, player, player.battlefield);
    gameEventManager.performSimultaneous([new GameEvent_TapCard(first), new GameEvent_TapCard(second)]);
    game.checkState();
    const triggered = game.stack.objects.filter(object => object instanceof StackAbility);
    expect(triggered.map(trigger => trigger.ability.slate.TAPPED)).toEqual([[first], [second]]);
});

test("tapping a selection produces one simultaneous batch for its untapped permanents", () => {
    Game.init();
    const player = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const first = addTestCard(creature, player, player.battlefield);
    const second = addTestCard(creature, player, player.battlefield);
    const tapped = addTestCard(creature, player, player.battlefield);
    const inHand = addTestCard(creature, player, player.hand);
    gameEventManager.addEvent(new GameEvent_TapCard(tapped));

    const batches: Permanent[][] = [];
    gameEventManager.rules.onBatch(events => {
        const taps = events.filter(event => event.type === RulesEventType.BecomesTapped);
        if (taps.length)
            batches.push(taps.map(event => event.permanent));
    });
    const ability = makeAbility({ parts: { AbilityPart_Effect_TapPermanents: { permanentsFrom: "SELECTED" } } }, first);
    ability.slate.SELECTED = [first, tapped, inHand, second];
    ability.fireSignal("default");

    expect(batches).toEqual([[first, second]]);
    expect(first.tapped && second.tapped && tapped.tapped).toBe(true);
});
