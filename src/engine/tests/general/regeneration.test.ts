import { makeAbility } from "@engine/abilities";
import { PlayerActions } from "@engine/actions";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_Advance,GameEvent_Cleanup,GameEvent_DealDamage,GameEvent_DestroyPermanent,GameEvent_GoToNextStep,GameEvent_GoToStep,GameEvent_RegeneratePermanent,GameEvent_SacrificePermanent } from "@engine/events";
import type { CheckRemovalOverride } from "@engine/effects/EffectSystem";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type { Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,BASIC_DECK,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { Keyword } from "~/defs";
import { cardData } from "~/index";

const bears = cardData[GRIZZLY_BEARS];
let player: Player;
let opponent: Player;

beforeEach(() => {
    Game.init();
    player = game.addPlayer(BASIC_DECK);
    opponent = game.addPlayer(BASIC_DECK);
});

function addShield(permanent: Permanent) {
    const ability = makeAbility({ parts: { AbilityPart_Effect_Regenerate: { recipient: "THIS" } } }, permanent);
    ability.fireSignal("default");
}

test("previews leave shields available and simultaneous destruction attempts spend one each", () => {
    const creature = addTestCard(bears, player, player.battlefield);
    addShield(creature);
    addShield(creature);
    const regenerated = vi.fn();
    const destroyed = vi.fn();
    creature.grantAbility({ parts: { AbilityPart_Trigger_Dies: {} } }, creature);
    gameEventManager.onGamePerformed(GameEventType.RegeneratePermanent, regenerated);
    gameEventManager.onGamePerformed(GameEventType.DestroyPermanent, destroyed);

    expect(gameEventManager.checkEvent(new GameEvent_DestroyPermanent(creature))).toBe(true);
    expect(creature.tapped).toBe(false);
    expect(regenerated).not.toHaveBeenCalled();
    gameEventManager.performSimultaneous([new GameEvent_DestroyPermanent(creature), new GameEvent_DestroyPermanent(creature)]);
    expect(creature.zone).toBe(player.battlefield);
    expect(regenerated).toHaveBeenCalledTimes(2);
    expect(destroyed).not.toHaveBeenCalled();
    expect(game.stack.objects).toHaveLength(0);

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(creature));
    expect(game.stack.objects).toHaveLength(1);
    expect(destroyed).toHaveBeenCalledOnce();
    expect(player.graveyard.objects.map(object => object.card)).toEqual([creature.card]);
});

test("lethal damage occurs before regeneration and leaves the same creature tapped with no damage", () => {
    const creature = addTestCard(bears, player, player.battlefield);
    const source = addTestCard(bears, opponent, opponent.battlefield);
    addShield(creature);
    const dealt = vi.fn(() => expect(creature.damageTaken).toBe(2));
    gameEventManager.onGamePerformed(GameEventType.DealDamage, dealt);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 2));
    expect(dealt).toHaveBeenCalledOnce();
    expect(player.battlefield.objects).toEqual([creature]);
    expect(creature).toMatchObject({ tapped: true, damageTaken: 0 });
    expect(player.graveyard.objects).toHaveLength(0);
});

test("a shield expires if cleanup commits before destruction", () => {
    const creature = addTestCard(bears, player, player.battlefield);
    addShield(creature);

    gameEventManager.addEvents([new GameEvent_Cleanup(player), new GameEvent_DestroyPermanent(creature)]);
    expect(player.graveyard.objects.map(object => object.card)).toEqual([creature.card]);
});

test("indestructible leaves a regeneration shield available", () => {
    const creature = addTestCard(bears, player, player.battlefield);
    addShield(creature);
    const { revoke } = creature.grantAbility({ keyword: Keyword.Indestructible, parts: {} }, creature);

    expect(gameEventManager.performImmediate(new GameEvent_DestroyPermanent(creature))).toBe(false);
    expect(creature.tapped).toBe(false);
    revoke();
    gameEventManager.addEvent(new GameEvent_DestroyPermanent(creature));
    expect(creature.zone).toBe(player.battlefield);
    expect(creature.tapped).toBe(true);
});

test("sacrifice and zero toughness bypass shields, and a returned creature has no shield", () => {
    const sacrificed = addTestCard(bears, player, player.battlefield);
    const zeroToughness = addTestCard(bears, player, player.battlefield);
    addShield(sacrificed);
    addShield(zeroToughness);

    gameEventManager.addEvent(new GameEvent_SacrificePermanent(player, sacrificed));
    zeroToughness.toughness = 0;
    game.checkState();
    expect(player.graveyard.objects.map(object => object.card)).toEqual([sacrificed.card, zeroToughness.card]);

    const returned = moveTestCard(player.graveyard.objects[0], player.battlefield);
    gameEventManager.addEvent(new GameEvent_DestroyPermanent(returned));
    expect(player.battlefield.objects).toHaveLength(0);
});

test("regenerating a blocker removes it from combat and keeps its attacker blocked", () => {
    const attacker = addTestCard(bears, player, player.battlefield);
    const blocker = addTestCard(bears, opponent, opponent.battlefield);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(player, [opponent]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    new PlayerActions.DeclareBlocker(blocker).perform(opponent, [attacker]);
    gameEventManager.addEvent(new GameEvent_Advance(opponent));
    addShield(blocker);

    gameEventManager.addEvent(new GameEvent_DestroyPermanent(blocker));
    expect(blocker.zone).toBe(opponent.battlefield);
    expect(blocker.tapped).toBe(true);
    expect([...CombatManager.blockRelationships()]).toEqual([]);
    expect(CombatManager.isBlocked(attacker)).toBe(true);

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));
    expect(opponent.life).toBe(20);
    expect(attacker.damageTaken).toBe(0);
    expect(blocker.damageTaken).toBe(0);
});

test("a check override can veto one regeneration replacement in a simultaneous destruction batch", () => {
    const first = addTestCard(bears, player, player.battlefield);
    const second = addTestCard(bears, player, player.battlefield);
    addShield(first);
    addShield(second);
    const destroyFirst = new GameEvent_DestroyPermanent(first);
    const denyFirst: CheckRemovalOverride = (event, _source, replacement) =>
        event === destroyFirst && replacement instanceof GameEvent_RegeneratePermanent;
    gameEventManager.onCheckRemovalOverride(denyFirst);
    try {
        gameEventManager.performSimultaneous([destroyFirst, new GameEvent_DestroyPermanent(second)]);
    } finally {
        gameEventManager.offCheckRemovalOverride(denyFirst);
    }
    expect(player.graveyard.objects.map(object => object.card)).toEqual([first.card]);
    expect(second.zone).toBe(player.battlefield);
    expect(second.tapped).toBe(true);
});
