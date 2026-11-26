import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_ChangeCardZone,GameEvent_DestroyPermanent } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { addTestCard,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { Battlefield } from "@engine/Zone";
import { cardData } from "~/index";

test("zone-change listeners can filter successful battlefield departures and use pre-batch state", () => {
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
    gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, departures, {
        matches: event => event.oldZone instanceof Battlefield,
        captureBeforeBatch: () => player.battlefield.objects.length,
    });
    gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, moves);

    gameEventManager.performSimultaneous([destroy, obsolete, returnToHand, discard]);

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
