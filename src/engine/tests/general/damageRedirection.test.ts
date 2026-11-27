import { makeAbility } from "@engine/abilities";
import { DamageAllocationAction,DamagePreventionKind,DamageRedirectionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DealDamage,ResolutionChoiceKind } from "@engine/events";
import type { DamageRecipient } from "@engine/events/GameEvent_DealDamage";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type { Permanent } from "@engine/GameObject";
import type Player from "@engine/Player";
import { addTestCard,GRIZZLY_BEARS,moveTestCard,startMainPhase } from "@engine/tests/testData";
import { cardData } from "~/index";

const bear = cardData[GRIZZLY_BEARS];
let owner: Player;
let controller: Player;
let creature: Permanent;
let source: Permanent;

beforeEach(() => {
    Game.init();
    owner = game.addPlayer([]);
    controller = game.addPlayer([]);
    startMainPhase();
    creature = addTestCard({ ...bear, toughness: 10, abilities: [{ parts: {} }] }, owner, owner.battlefield);
    creature.controller = controller;
    source = addTestCard(bear, controller, controller.battlefield);
});

function redirect(from: DamageRecipient = creature, to: DamageRecipient = owner, amount = 1) {
    const ability = makeAbility({ parts: {
        AbilityPart_Effect_RedirectDamage: { from: "FROM", to: "TO", amount },
    } }, creature);
    ability.slate.FROM = [from];
    ability.slate.TO = [to];
    ability.fireSignal("default");
}

function prevent(recipient: Permanent | Player, amount = 1) {
    gameEventManager.startContinuousUntilEndOfTurn(creature.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: { kind: DamagePreventionKind.Points, target: recipient, amount },
    });
}

test("whole-hit redirection competes with prevention and rechecks shields on the destination", () => {
    gameEventManager.effects.startContinuous(creature.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: { kind: DamageRedirectionKind.EveryHit, destination: creature, matches: hit => hit.recipient === owner },
    });
    prevent(owner, 1);
    prevent(creature, 2);
    const hit = new GameEvent_DealDamage(source, owner, 3);
    gameEventManager.addEvent(hit);
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a choice between redirection and prevention");
    expect(choice.player).toBe(owner);
    choice.submit(owner, choice.options.findIndex(label => label.includes("shield")));
    expect(creature.damageTaken).toBe(0);
    expect(owner.life).toBe(20);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 3));
    expect(creature.damageTaken).toBe(3);
    expect(owner.life).toBe(20);
});

test("continuous redirection follows the selected sources and destination for as long as its permanent remains", () => {
    const permanent = addTestCard({
        ...bear,
        abilities: [{ parts: {
            AbilityPart_Effect_RedirectDamage: { continuous: true, from: "THIS.owner", to: "TO", sourcesFrom: "SOURCES" },
        } }],
    }, owner, owner.battlefield);
    const { slate } = permanent.abilities[0];
    const hit = () => new GameEvent_DealDamage(source, owner, 1);
    slate.SOURCES = [source];
    expect(gameEventManager.checkEvent(hit())).toBe(true);
    expect(gameEventManager.effects.getEventCheckReferences()).not.toContain(creature);
    gameEventManager.addEvent(hit());
    expect(owner.life).toBe(19);

    slate.TO = [creature];
    expect(gameEventManager.effects.getEventCheckReferences()).toContain(creature);
    gameEventManager.addEvent(hit());
    expect(creature.damageTaken).toBe(1);
    slate.TO = [controller];
    gameEventManager.addEvent(hit());
    expect(controller.life).toBe(19);
    slate.SOURCES = [];
    gameEventManager.addEvent(hit());
    expect(owner.life).toBe(18);

    slate.SOURCES = [source];
    moveTestCard(permanent, owner.hand);
    gameEventManager.addEvent(hit());
    expect(owner.life).toBe(17);
    expect(controller.life).toBe(19);
});

test.each([
    { direction: "creature to creature", from: () => creature, to: () => source },
    { direction: "creature to player", from: () => creature, to: () => owner },
    { direction: "player to creature", from: () => owner, to: () => creature },
    { direction: "player to player", from: () => owner, to: () => controller },
])("the ability redirects damage from $direction", ({ from, to }) => {
    const recipient = from();
    const destination = to();
    redirect(recipient, destination);
    const dealt = vi.fn();
    gameEventManager.onGamePerformed(GameEventType.DealDamage, dealt);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, recipient, 2));

    expect(dealt.mock.calls.map(([event]) => [event.source, event.recipient, event.amount]))
        .toEqual([[source, recipient, 1], [source, destination, 1]]);
});

test("prevention on a destination creature applies in previews and when damage is dealt", () => {
    redirect(owner, creature);
    prevent(creature);
    const hit = new GameEvent_DealDamage(source, owner, 1);

    expect(gameEventManager.checkEvent(hit)).toBe(false);
    expect(gameEventManager.performImmediate(hit)).toBe(false);
    expect(owner.life).toBe(20);
    expect(creature.damageTaken).toBe(0);
});

test("redirection leaves damage on the original recipient if the destination creature leaves", () => {
    redirect(owner, creature);
    moveTestCard(creature, owner.hand);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 1));

    expect(owner.life).toBe(19);
    expect(creature.damageTaken).toBe(0);
});

test("each redirection applies at most once to an original hit that returns to its recipient", () => {
    redirect(owner, creature, 3);
    redirect(creature, owner, 2);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 1));
    expect(owner.life).toBe(19);
    expect(creature.damageTaken).toBe(0);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 1));
    expect(owner.life).toBe(18);
    expect(creature.damageTaken).toBe(0);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 1));
    expect(owner.life).toBe(18);
    expect(creature.damageTaken).toBe(1);
});

test("redirection splits damage within one event batch and preserves attribution and completion", () => {
    redirect();
    const hit = new GameEvent_DealDamage(source, creature, 3);
    const complete = vi.fn();
    hit.then(complete);
    gameEventManager.effects.resolveOneShot(creature.abilities[0], effect => { hit.effect = effect; });
    const committed = vi.fn((event: GameEvent_DealDamage) => {
        expect(owner.life).toBe(19);
        expect(creature.damageTaken).toBe(2);
        expect(event.source).toBe(source);
        expect(event.effect).toBe(hit.effect);
    });
    gameEventManager.onGamePerformed(GameEventType.DealDamage, committed);

    expect(gameEventManager.performImmediate(hit)).toBe(true);

    expect(committed.mock.calls.map(([event]) => [event.recipient, event.amount])).toEqual([[creature, 2], [owner, 1]]);
    expect(complete).toHaveBeenCalledTimes(1);
});

test("the affected permanent's controller chooses between prevention and redirection", () => {
    redirect();
    prevent(creature);
    gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
    const choice = game.pendingDamagePreventionChoice;
    expect(choice?.kind).toBe(ResolutionChoiceKind.DamagePreventionOrder);
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a damage effect choice");
    expect(choice.player).toBe(controller);
    const prevention = choice.options.findIndex(label => label.includes("shield"));
    choice.submit(owner, prevention);
    expect(game.pendingDamagePreventionChoice).toBe(choice);
    choice.submit(controller, prevention);
    expect(owner.life).toBe(20);
    expect(creature.damageTaken).toBe(0);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
    expect(owner.life).toBe(19);
    expect(creature.damageTaken).toBe(0);
});

test("a redirected hit can be prevented on the new recipient even if that player is earlier in turn order", () => {
    redirect();
    prevent(owner);
    const hit = new GameEvent_DealDamage(source, creature, 1);
    expect(gameEventManager.checkEvent(hit)).toBe(false);
    expect(gameEventManager.performImmediate(hit)).toBe(false);
    expect(owner.life).toBe(20);
    expect(creature.damageTaken).toBe(0);

    gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 1));
    expect(owner.life).toBe(19);
});

test("the controller allocates limited redirection among simultaneous damage sources", () => {
    const second = addTestCard(bear, controller, controller.battlefield);
    redirect();
    const dealt = vi.fn();
    gameEventManager.onGamePerformed(GameEventType.DealDamage, dealt);
    gameEventManager.performSimultaneous([
        new GameEvent_DealDamage(source, creature, 2),
        new GameEvent_DealDamage(second, creature, 2),
    ]);
    const choice = game.pendingDamagePreventionChoice;
    expect(choice?.kind).toBe(ResolutionChoiceKind.DamagePreventionAllocation);
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionAllocation)
        throw new Error("Expected a damage allocation choice");
    expect(choice).toMatchObject({ player: controller, action: DamageAllocationAction.Redirect, total: 1 });
    choice.submit(controller, [1, 1]);
    expect(dealt).not.toHaveBeenCalled();
    choice.submit(controller, [0, 1]);

    expect(dealt).toHaveBeenCalledTimes(3);
    expect(dealt).toHaveBeenCalledWith(expect.objectContaining({ source: second, recipient: owner, amount: 1 }));
    expect(creature.damageTaken).toBe(3);
});
