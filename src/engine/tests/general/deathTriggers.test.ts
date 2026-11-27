import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent,GameEvent_SacrificePermanent } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { addTestCard,chooseEarliestTimestamps,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { StackAbility } from "@engine/GameObject";
import { Battlefield,ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
import { cardData } from "~/index";

test("beforeZoneChange prepares each candidate before the batch and confirms only successful departures", () => {
    Game.init();
    const player = game.addPlayer([]);
    const bear = cardData[GRIZZLY_BEARS];
    const destroyed = addTestCard(bear, player, player.battlefield);
    const returned = addTestCard(bear, player, player.battlefield);
    const inHand = addTestCard(bear, player, player.hand);
    const destroy = new GameEvent_DestroyPermanent(destroyed);
    const returnToHand = new GameEvent_ChangeCardZone(returned, player.hand);
    const obsolete = new GameEvent_ChangeCardZone(destroyed, player.hand);
    const discard = new GameEvent_ChangeCardZone(inHand, player.graveyard);
    const departures = vi.fn((event: GameEvent_ChangeCardZone, battlefieldSize: number) => {
        expect(player.battlefield.objects).toHaveLength(0);
        expect(event.newObject.zone).toBe(event.newZone);
        expect(battlefieldSize).toBe(2);
    });
    const moves = vi.fn();
    const prepare = vi.fn((event: GameEvent_ChangeCardZone) => {
        const battlefieldSize = player.battlefield.objects.length;
        expect(battlefieldSize).toBe(2);
        if (event.oldZone instanceof Battlefield)
            return () => departures(event, battlefieldSize);
    });
    gameEventManager.beforeZoneChange(prepare);
    gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, moves);

    gameEventManager.performSimultaneous([destroy, obsolete, returnToHand, discard]);
    chooseEarliestTimestamps(player, returned, destroyed);

    expect(prepare.mock.calls.map(([event]) => event)).toEqual([destroy, obsolete, returnToHand, discard]);
    expect(departures.mock.calls.map(([event]) => event)).toEqual([destroy, returnToHand]);
    expect(moves.mock.calls).toEqual([[destroy], [returnToHand], [discard]]);
});

test("a death trigger is captured even if the permanent granting it dies in the same batch", () => {
    Game.init();
    const player = game.addPlayer([]);
    game.addPlayer([]);
    startMainPhase();
    const bear = cardData[GRIZZLY_BEARS];
    const grantor = addTestCard({ ...bear, abilities: [{ parts: {} }] }, player, player.battlefield);
    const recipient = addTestCard(bear, player, player.battlefield);
    const stop = gameEventManager.effects.startContinuous(grantor.abilities[0], {
        kind: ContinuousEffectKind.AbilityGrant,
        recipients: () => grantor.zone ? [recipient] : [],
        grant: { parts: {
            AbilityPart_Trigger_Dies: {},
            AbilityPart_Effect_LoseLife: { target: "THIS.owner", amount: 1 },
        } },
    });
    try {
        expect(recipient.abilities).toHaveLength(1);
        grantor.toughness = 0;
        recipient.toughness = 0;
        game.checkState();
        chooseEarliestTimestamps(player, recipient);

        expect(game.stack.objects).toHaveLength(1);
        expect(game.stack.objects[0]).toMatchObject({ source: recipient });
        passPriorityRound();
        expect(player.life).toBe(19);
    } finally {
        stop();
    }
});

test("a creature that loses its death ability before it dies produces no trigger", () => {
    Game.init();
    const player = game.addPlayer([]);
    startMainPhase();
    const recipient = addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
    const { revoke } = recipient.grantAbility({ parts: { AbilityPart_Trigger_Dies: {} } }, recipient);
    revoke();
    gameEventManager.addEvent(new GameEvent_DestroyPermanent(recipient));

    expect(player.graveyard.objects.at(-1).card).toBe(recipient.card);
    expect(game.stack.objects).toHaveLength(0);
});

test("three simultaneous deaths resolve independently using one pre-move slate per occurrence", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();
    const bear = cardData[GRIZZLY_BEARS];
    const watcher = addTestCard({
        ...bear, power: 1,
        abilities: [{ parts: {
            AbilityPart_Trigger_Dies: { subject: { cardType: CardType.Creature }, storeAs: "DYING", beforeMoveSignal: "READ" },
            AbilityPart_ReadValue: [
                { inSignal: "READ", value: "DYING.power", saveAs: "AMOUNT" },
                { inSignal: "READ", value: "DYING.controller", saveAs: "PLAYER" },
            ],
            AbilityPart_SelectObjects: {
                inSignal: "READ", zone: ZoneKind.Battlefield, targetValidator: { cardType: CardType.Creature }, saveAs: "CREATURES",
            },
            AbilityPart_Effect_DealDamage: { source: "THIS", target: "PLAYER", amount: "AMOUNT" },
        } }],
    }, player, player.battlefield);
    const second = addTestCard({ ...bear, power: 3 }, opponent, opponent.battlefield);
    const third = addTestCard({ ...bear, power: 5 }, player, player.battlefield);
    const returned = addTestCard(bear, player, player.battlefield);
    const land = addTestCard(cardData.find(card => card.name === "Forest"), player, player.battlefield);
    const sourceSlate = watcher.abilities[0].slate;
    sourceSlate.AMOUNT = [9];

    gameEventManager.performSimultaneous([
        new GameEvent_DestroyPermanent(watcher),
        new GameEvent_ChangeCardZone(returned, player.hand),
        new GameEvent_DestroyPermanent(returned),
        new GameEvent_SacrificePermanent(player, second),
        new GameEvent_SacrificePermanent(opponent, second),
        new GameEvent_DestroyPermanent(third),
        new GameEvent_DestroyPermanent(third),
        new GameEvent_DestroyPermanent(land),
    ]);
    chooseEarliestTimestamps(player, watcher, land, third);
    game.checkState();

    const slates = game.stack.objects.map(object => {
        expect(object).toBeInstanceOf(StackAbility);
        return (object as StackAbility).ability.slate;
    });
    expect(slates.map(slate => slate.DYING[0])).toEqual([watcher, second, third]);
    expect(slates.map(slate => slate.AMOUNT[0])).toEqual([1, 3, 5]);
    expect(slates.map(slate => slate.PLAYER[0])).toEqual([player, opponent, player]);
    for (const slate of slates)
        expect(slate.CREATURES).toEqual([watcher, third, returned, second]);
    expect(new Set([sourceSlate, ...slates]).size).toBe(4);
    expect(sourceSlate.AMOUNT).toEqual([9]);
    expect(sourceSlate.DYING).toBeUndefined();

    passPriorityRound();
    expect([player.life, opponent.life]).toEqual([15, 20]);
    passPriorityRound();
    expect([player.life, opponent.life]).toEqual([15, 17]);
    passPriorityRound();
    expect([player.life, opponent.life]).toEqual([14, 17]);
});

test("a later death keeps its own reads while the previous trigger is still on the stack", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();
    const bear = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...bear, abilities: [{ parts: {
            AbilityPart_Trigger_Dies: { subject: "WATCHED", beforeMoveSignal: "READ" },
            AbilityPart_ReadValue: { inSignal: "READ", value: "WATCHED.power", saveAs: "AMOUNT" },
            AbilityPart_Effect_DealDamage: { source: "THIS", target: "CONTROLLER", amount: "AMOUNT" },
        } }],
    }, player, player.battlefield);
    const slate = source.abilities[0].slate;
    const first = addTestCard({ ...bear, power: 2 }, player, player.battlefield);
    const second = addTestCard({ ...bear, power: 4 }, opponent, opponent.battlefield);

    slate.WATCHED = [first];
    gameEventManager.addEvent(new GameEvent_DestroyPermanent(first));
    source.controller = opponent;
    slate.WATCHED = [second];
    gameEventManager.addEvent(new GameEvent_DestroyPermanent(second));
    expect(game.stack.objects).toHaveLength(2);
    expect(slate.AMOUNT).toBeUndefined();

    passPriorityRound();
    expect([player.life, opponent.life]).toEqual([20, 16]);
    passPriorityRound();
    expect([player.life, opponent.life]).toEqual([18, 16]);
});
