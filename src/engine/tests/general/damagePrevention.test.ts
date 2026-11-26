import { PlayerActions } from "@engine/actions";
import { DamagePreventionKind,DamageRedirectionKind } from "@engine/effects/DamagePrevention";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_ActivateAbility,GameEvent_Advance,GameEvent_Cleanup,GameEvent_DealDamage,GameEvent_GoToNextStep,GameEvent_GoToStep,ResolutionChoiceKind } from "@engine/events";
import gameEventManager,{ type CheckSource,type EventCheck,type GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { type CardObject,type Permanent,Spell } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

const redCreature = cardData[MONS_GOBLIN_RAIDERS];
const redCircle = cardData.find(card => card.name === "Circle of Protection: Red");

let protectedPlayer: Player;
let opponent: Player;
let circle: Permanent;

beforeEach(() => {
    Game.init();
    protectedPlayer = game.addPlayer([]);
    opponent = game.addPlayer([]);
    startMainPhase();
    circle = addTestCard(redCircle, protectedPlayer, protectedPlayer.battlefield);
});

function activate() {
    protectedPlayer.manaPool[ManaColour.R]++;
    gameEventManager.addEvent(new GameEvent_ActivateAbility(protectedPlayer, circle, circle.abilities[0]));
}

function choose(source: CardObject) {
    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice?.options).toContain(source);
    choice.submit(protectedPlayer, [source]);
    expect(game.pendingResolutionChoice).toBeNull();
}

function hit(source: CardObject, amount = 2) {
    return new GameEvent_DealDamage(source, protectedPlayer, amount);
}

function shield(recipient: Player | Permanent, amount: number) {
    const permanent = addTestCard({ ...redCircle, name: "Finite shield" }, protectedPlayer, protectedPlayer.battlefield);
    gameEventManager.startContinuousUntilEndOfTurn(permanent.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: { kind: DamagePreventionKind.Points, recipient, amount },
    });
}

test("a finite shield carries over and observers see only damage that was actually dealt", () => {
    const source = addTestCard(redCreature, opponent, opponent.battlefield);
    shield(protectedPlayer, 3);
    expect(gameEventManager.checkEvent(hit(source, 3))).toBe(false);
    expect(gameEventManager.checkEvent(hit(source, 4))).toBe(true);
    expect(gameEventManager.checkEvent(hit(source, 3))).toBe(false);
    const notify = vi.fn();
    gameEventManager.onGamePerformed(GameEventType.DealDamage, notify);

    gameEventManager.addEvent(hit(source, 1));
    expect(protectedPlayer.life).toBe(20);
    expect(notify).not.toHaveBeenCalled();

    const incoming = hit(source, 3);
    const callback = vi.fn();
    incoming.then(callback);
    gameEventManager.effects.resolveOneShot(circle.abilities[0], effect => { incoming.effect = effect; });
    expect(gameEventManager.performImmediate(incoming)).toBe(true);
    expect(protectedPlayer.life).toBe(19);
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: 1, source, effect: incoming.effect }));
    expect(callback).toHaveBeenCalledTimes(1);
    gameEventManager.addEvent(hit(source));
    expect(protectedPlayer.life).toBe(17);
});

test("a one-point shield waits for damage to its recipient and expires unused at cleanup", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    shield(protectedPlayer, 1);
    gameEventManager.addEvent(new GameEvent_DealDamage(attacker, opponent, 1));
    expect(opponent.life).toBe(19);
    expect(gameEventManager.checkEvent(hit(attacker, 1))).toBe(false);
    gameEventManager.addEvent(new GameEvent_Cleanup(protectedPlayer));
    gameEventManager.addEvent(hit(attacker, 1));
    expect(protectedPlayer.life).toBe(19);
});

test("source selection and prevention both check the configured creature and tapped requirements", () => {
    const targetValidator = { cardType: CardType.Creature, tapped: true };
    circle = addTestCard({ ...redCircle, abilities: [{ parts: {
        AbilityPart_Activate_Mana: { cost: "{0}" },
        AbilityPart_Effect_ChooseDamageSource: { targetValidator, saveAs: "SOURCE", outSignal: "CHOSEN" },
        AbilityPart_Effect_PreventNextDamageFromSource: { inSignal: "CHOSEN", source: "SOURCE", targetValidator },
    } }] }, protectedPlayer, protectedPlayer.battlefield);
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    attacker.tapped = true;
    circle.tapped = true;
    addTestCard(redCreature, opponent, opponent.battlefield);

    activate();
    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice.options).toEqual([attacker]);
    choice.submit(protectedPlayer, [attacker]);

    attacker.tapped = false;
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
    attacker.tapped = true;
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
});

test("a next-hit shield evaluates its source predicate when damage would be dealt", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    gameEventManager.startContinuousUntilEndOfTurn(circle.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: {
            kind: DamagePreventionKind.NextHit,
            recipient: protectedPlayer,
            source: attacker,
            matches: ({ source }) => source.power >= 2,
        },
    });

    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
    attacker.power = 2;
    expect(gameEventManager.checkEvent(hit(attacker))).toBe(false);
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(16);
});

test.each([1, 4])("a next-hit follow-up sees only damage left after a %i-point shield", capacity => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    const prevented = vi.fn((_amount: number) => expect(opponent.life).toBe(18));
    gameEventManager.startContinuousUntilEndOfTurn(circle.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: { kind: DamagePreventionKind.NextHit, source: attacker, recipient: protectedPlayer, onPrevented: prevented },
    });
    shield(protectedPlayer, capacity);
    expect(gameEventManager.checkEvent(hit(attacker, 4))).toBe(false);
    gameEventManager.performSimultaneous([hit(attacker, 4), new GameEvent_DealDamage(attacker, opponent, 2)]);
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a prevention order choice");
    expect(prevented).not.toHaveBeenCalled();
    choice.submit(protectedPlayer, choice.options.findIndex(option => option.startsWith("Finite shield")));
    if (capacity === 4) {
        expect(prevented).not.toHaveBeenCalled();
        gameEventManager.addEvent(hit(attacker, 3));
    }
    expect(prevented).toHaveBeenCalledExactlyOnceWith(3);
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
});

test("different next-hit shield keys preserve the choice of which shield to spend", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    attacker.power = 2;
    for (const minimumPower of [1, 2]) {
        gameEventManager.startContinuousUntilEndOfTurn(circle.abilities[0], {
            kind: ContinuousEffectKind.DamageEffect,
            rule: {
                kind: DamagePreventionKind.NextHit,
                recipient: protectedPlayer,
                source: attacker,
                matches: ({ source }) => source.power >= minimumPower,
                equivalenceKey: minimumPower,
            },
        });
    }

    gameEventManager.addEvent(hit(attacker));
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a prevention order choice");
    expect(choice.options).toHaveLength(2);
    choice.submit(protectedPlayer, 1);

    attacker.power = 1;
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(20);
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
});

test("the affected creature's controller allocates prevention before any hit commits", () => {
    const red = addTestCard(redCreature, protectedPlayer, protectedPlayer.battlefield);
    const green = addTestCard(cardData[GRIZZLY_BEARS], protectedPlayer, protectedPlayer.battlefield);
    const creature = addTestCard({ ...redCreature, toughness: 4 }, opponent, opponent.battlefield);
    shield(creature, 2);
    const observed: [CardObject, number, number][] = [];
    gameEventManager.onGamePerformed(GameEventType.DealDamage, (event: GameEvent_DealDamage) => {
        observed.push([event.source, creature.damageTaken, protectedPlayer.life]);
    });

    gameEventManager.performSimultaneous([
        new GameEvent_DealDamage(red, creature, 2),
        new GameEvent_DealDamage(green, creature, 2),
        hit(red, 1),
    ]);
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionAllocation)
        throw new Error("Expected a prevention allocation");
    expect(choice.player).toBe(opponent);
    expect(choice.hits.map(hit => hit.source)).toEqual([red, green]);
    expect(game.priorityPlayer).toBeNull();
    expect(creature.damageTaken).toBe(0);
    expect(protectedPlayer.life).toBe(20);
    choice.submit(protectedPlayer, [2, 0]);
    choice.submit(opponent, [3, -1]);
    choice.submit(opponent, [1, 0]);
    expect(game.pendingDamagePreventionChoice).toBe(choice);

    gameEventManager.addEvent(new GameEvent_DealDamage(green, opponent, 1));
    expect(observed).toEqual([]);
    choice.submit(opponent, [2, 0]);
    expect(game.pendingDamagePreventionChoice).toBeNull();
    expect(observed).toEqual([[green, 2, 19], [red, 2, 19], [green, 2, 19]]);
    expect(opponent.life).toBe(19);
});

test("simultaneous prevention choices are made with the turn player first", () => {
    const red = addTestCard(redCreature, opponent, opponent.battlefield);
    const green = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    shield(protectedPlayer, 1);
    shield(opponent, 1);
    gameEventManager.performSimultaneous([red, green].map(source => new GameEvent_DealDamage(source, opponent, 1))
        .concat([red, green].map(source => hit(source, 1))));
    const first = game.pendingDamagePreventionChoice;
    if (first?.kind !== ResolutionChoiceKind.DamagePreventionAllocation)
        throw new Error("Expected the turn player's allocation");
    expect(first.player).toBe(protectedPlayer);
    first.submit(protectedPlayer, [1, 0]);
    const second = game.pendingDamagePreventionChoice;
    if (second?.kind !== ResolutionChoiceKind.DamagePreventionAllocation)
        throw new Error("Expected the opponent's allocation");
    expect(second.player).toBe(opponent);
    expect([protectedPlayer.life, opponent.life]).toEqual([20, 20]);
    second.submit(opponent, [0, 1]);
    expect([protectedPlayer.life, opponent.life]).toEqual([19, 19]);
});

test.each([true, false])("the affected player can apply the Circle first: %s", circleFirst => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    const other = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    activate();
    choose(attacker);
    shield(protectedPlayer, 1);

    gameEventManager.addEvents([hit(attacker), hit(other, 1)]);
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a prevention order choice");
    expect(choice.player).toBe(protectedPlayer);
    expect(choice.options[0]).toContain("Circle of Protection");
    expect(choice.options[1]).toContain("Finite shield");
    expect(protectedPlayer.life).toBe(20);
    choice.submit(protectedPlayer, circleFirst ? 0 : 1);
    expect(game.pendingDamagePreventionChoice).toBeNull();
    expect(protectedPlayer.life).toBe(circleFirst ? 20 : 19);
});

test("applying protection first saves a finite shield for damage of a different colour", () => {
    const red = addTestCard(redCreature, opponent, opponent.battlefield);
    const green = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const creature = addTestCard({
        ...cardData[GRIZZLY_BEARS], abilities: [{ parts: { AbilityPart_Protection: { colour: "R" } } }],
    }, protectedPlayer, protectedPlayer.battlefield);
    shield(creature, 1);
    gameEventManager.addEvent(new GameEvent_DealDamage(red, creature, 1));
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
        throw new Error("Expected a prevention order choice");
    expect(choice.options[0]).toBe(`${creature.name} · prevent 1 damage from ${red.name} to ${creature.name}`);
    choice.submit(protectedPlayer, 0);
    gameEventManager.addEvent(new GameEvent_DealDamage(green, creature, 1));
    expect(creature.damageTaken).toBe(0);
});

test("copies of a shield are consumed one at a time by committed positive damage", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    activate();
    activate();
    choose(attacker);
    choose(attacker);

    expect(gameEventManager.checkEvent(hit(attacker))).toBe(false);
    expect(gameEventManager.checkEvent(hit(attacker))).toBe(false);
    gameEventManager.addEvent(hit(attacker, 0));
    const notify = vi.fn();
    const stopListening = gameEventManager.onGamePerformed(GameEventType.DealDamage, notify);
    gameEventManager.performSimultaneous([hit(attacker), hit(attacker)]);
    expect(game.pendingDamagePreventionChoice).toBeNull();
    expect(protectedPlayer.life).toBe(20);
    expect(notify).not.toHaveBeenCalled();
    expect(gameEventManager.performImmediate(hit(attacker))).toBe(true);
    expect(protectedPlayer.life).toBe(18);
    expect(notify).toHaveBeenCalledTimes(1);
    stopListening();
});

test("the shield rechecks colour on damage and expires in cleanup", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    const red = attacker.colours;
    activate();
    choose(attacker);

    attacker.colours = new Set(["G"]);
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);
    attacker.colours = red;
    gameEventManager.addEvent(hit(attacker));
    expect(protectedPlayer.life).toBe(18);

    activate();
    choose(attacker);
    gameEventManager.addEvents([new GameEvent_Cleanup(protectedPlayer), hit(attacker)]);
    expect(protectedPlayer.life).toBe(16);
});

test("a vetoed event and a removal override leave the shield available", () => {
    const attacker = addTestCard(redCreature, opponent, opponent.battlefield);
    activate();
    choose(attacker);

    const vetoed = hit(attacker);
    const allowed = hit(attacker);
    const veto = (check: EventCheck) => check.removeWhere(event => event === vetoed);
    const override = (event: GameEvent, source: CheckSource) => event === allowed && source.object === circle;
    gameEventManager.onCheck(veto);
    gameEventManager.onCheckRemovalOverride(override);
    try {
        expect(gameEventManager.checkEvent(vetoed)).toBe(false);
        expect(gameEventManager.checkEvent(allowed)).toBe(true);
        gameEventManager.addEvents([vetoed, allowed, hit(attacker)]);
        expect(protectedPlayer.life).toBe(18);
        gameEventManager.addEvent(hit(attacker));
        expect(protectedPlayer.life).toBe(16);
    } finally {
        gameEventManager.offCheck(veto);
        gameEventManager.offCheckRemovalOverride(override);
    }
});

test("the Circle can leave before resolution and its shield can stop a spell's damage", () => {
    const damageSpell = addTestCard({
        ...redCreature,
        type: CardType.Instant,
        abilities: [{ parts: {
            AbilityPart_Effect_DealDamage: { inSignal: "SPELL_RESOLVE", source: "THIS", target: "THIS.controller", amount: 3 },
        } }],
    }, protectedPlayer, protectedPlayer.hand);
    expect(game.stack.spellCast(protectedPlayer, damageSpell)).toBe(true);
    const spell = game.stack.objects.at(-1);
    expect(spell).toBeInstanceOf(Spell);
    activate();
    moveTestCard(circle, protectedPlayer.graveyard);
    choose(spell as Spell);

    passPriorityRound();
    expect(protectedPlayer.life).toBe(20);
    expect(game.stack.objects).toHaveLength(0);
    expect(protectedPlayer.graveyard.objects.some(card => card.card === damageSpell.card)).toBe(true);
});

test("a chosen permanent spell shields damage from the permanent it becomes", () => {
    const card = addTestCard(redCreature, opponent, opponent.hand);
    expect(game.stack.spellCast(opponent, card)).toBe(true);
    activate();
    choose(game.stack.objects[0] as Spell);
    expect(game.stack.objects).toHaveLength(1);

    passPriorityRound();
    const permanent = opponent.battlefield.objects.find(object => object.card === card.card);
    gameEventManager.addEvent(hit(permanent));
    expect(protectedPlayer.life).toBe(20);
    gameEventManager.addEvent(hit(permanent));
    expect(protectedPlayer.life).toBe(18);
});

test("a retired source is a legal choice while the stack or a shield refers to it", () => {
    const red = addTestCard({ ...redCreature, abilities: [{ parts: {
        AbilityPart_Activate_Mana: { cost: "{1}" },
        AbilityPart_Effect_DealDamage: { source: "THIS", target: "CONTROLLER", amount: 2 },
    } }] }, protectedPlayer, protectedPlayer.battlefield);
    protectedPlayer.manaPool[ManaColour.R]++;
    gameEventManager.addEvent(new GameEvent_ActivateAbility(protectedPlayer, red, red.abilities[0]));
    const graveyardCard = moveTestCard(red, protectedPlayer.graveyard);
    const newPermanent = moveTestCard(graveyardCard, protectedPlayer.battlefield);
    activate();
    choose(red);
    activate();
    choose(red);
    passPriorityRound();

    expect(protectedPlayer.life).toBe(20);
    gameEventManager.addEvent(hit(newPermanent));
    expect(protectedPlayer.life).toBe(18);
    activate();
    choose(red);
    gameEventManager.addEvents([hit(red), hit(red), hit(red)]);
    expect(protectedPlayer.life).toBe(16);
});

test("an activation can resolve without eligible sources", () => {
    const hidden = addTestCard(redCreature, opponent, opponent.hand);
    activate();
    passPriorityRound();
    expect(game.pendingResolutionChoice).toBeNull();
    expect(game.stack.objects).toHaveLength(0);

    const exposed = moveTestCard(hidden, opponent.battlefield);
    gameEventManager.addEvent(hit(exposed));
    expect(protectedPlayer.life).toBe(18);
});

test("a targeted stack ability keeps its departed target eligible as a damage source", () => {
    const target = addTestCard(redCreature, opponent, opponent.battlefield);
    const permanent = addTestCard({ ...redCreature, abilities: [{ parts: {
        AbilityPart_Activate_Mana: { cost: "{0}" },
        AbilityPart_Target: { saveAs: "TARGET", validTargets: ["Permanent"] },
    } }] }, protectedPlayer, protectedPlayer.battlefield);
    gameEventManager.addEvent(new GameEvent_ActivateAbility(protectedPlayer, permanent, permanent.abilities[0], [target]));
    const newCard = moveTestCard(target, opponent.graveyard);
    activate();
    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice.options).toContain(target);
    expect(choice.options).not.toContain(newCard);
    choice.submit(protectedPlayer, [target]);
    gameEventManager.addEvent(hit(target));
    expect(protectedPlayer.life).toBe(20);
});

test("waiting damage effects retain references to their recipients and redirection destinations", () => {
    const makeCreature = () => addTestCard(redCreature, opponent, opponent.battlefield);
    const protectedCreature = makeCreature();
    const from = makeCreature();
    const to = makeCreature();
    shield(protectedCreature, 1);
    gameEventManager.startContinuousUntilEndOfTurn(circle.abilities[0], {
        kind: ContinuousEffectKind.DamageEffect,
        rule: { kind: DamageRedirectionKind.Points, recipient: from, destination: to, amount: 1 },
    });
    const referenced = [protectedCreature, from, to];
    for (const permanent of referenced)
        moveTestCard(permanent, opponent.graveyard);
    activate();
    passPriorityRound();
    expect(game.pendingResolutionChoice.options).toEqual(referenced);
    game.pendingResolutionChoice.submit(protectedPlayer, [to]);
});

test("source selection uses the resolution state and rejects choices that become ineligible", () => {
    const early = addTestCard(redCreature, opponent, opponent.battlefield);
    activate();
    const removed = moveTestCard(early, opponent.graveyard);
    const first = addTestCard(redCreature, opponent, opponent.battlefield);
    const second = addTestCard(redCreature, opponent, opponent.battlefield);
    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice.options).toEqual([first, second]);

    first.colours = new Set(["G"]);
    choice.submit(protectedPlayer, []);
    choice.submit(protectedPlayer, [removed]);
    choice.submit(protectedPlayer, [first]);
    expect(game.pendingResolutionChoice).toBe(choice);
    choice.submit(protectedPlayer, [second]);
    expect(game.pendingResolutionChoice).toBeNull();
    gameEventManager.addEvent(hit(second));
    expect(protectedPlayer.life).toBe(20);
});

test("a Circle protects its controller from the chosen unblocked attacker in combat", () => {
    const chosen = addTestCard(redCreature, protectedPlayer, protectedPlayer.battlefield);
    const other = addTestCard(redCreature, protectedPlayer, protectedPlayer.battlefield);
    circle = addTestCard(redCircle, opponent, opponent.battlefield);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [chosen, other])
        new PlayerActions.DeclareAttacker(attacker).perform(protectedPlayer, [opponent]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    gameEventManager.addEvent(new GameEvent_Advance(opponent));
    gameEventManager.addEvent(new GameEvent_Advance(protectedPlayer));
    expect(game.priorityPlayer).toBe(opponent);
    opponent.manaPool[ManaColour.R]++;
    gameEventManager.addEvent(new GameEvent_ActivateAbility(opponent, circle, circle.abilities[0]));
    passPriorityRound();
    game.pendingResolutionChoice.submit(opponent, [chosen]);

    passPriorityRound();
    expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
    expect(opponent.life).toBe(19);
    expect(protectedPlayer.life).toBe(20);
});

test("combat waits for prevention allocation before dealing damage and granting priority", () => {
    const first = addTestCard(redCreature, protectedPlayer, protectedPlayer.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], protectedPlayer, protectedPlayer.battlefield);
    shield(opponent, 1);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [first, second])
        new PlayerActions.DeclareAttacker(attacker).perform(protectedPlayer, [opponent]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    gameEventManager.addEvent(new GameEvent_Advance(opponent));
    passPriorityRound();

    expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
    expect(game.priorityPlayer).toBeNull();
    expect(opponent.life).toBe(20);
    const choice = game.pendingDamagePreventionChoice;
    if (choice?.kind !== ResolutionChoiceKind.DamagePreventionAllocation)
        throw new Error("Expected a prevention allocation");
    expect(choice.player).toBe(opponent);
    expect(choice.hits.map(hit => hit.source)).toEqual([first, second]);
    choice.submit(opponent, [0, 1]);
    expect(opponent.life).toBe(18);
    expect(game.priorityPlayer).toBe(protectedPlayer);
});
