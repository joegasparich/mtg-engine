import { PlayerActions } from "@engine/actions";
import { GameEvent_ActivateAbility,GameEvent_Advance,GameEvent_Cleanup,GameEvent_DealDamage,GameEvent_GoToNextStep,GameEvent_GoToStep } from "@engine/events";
import gameEventManager,{ type CheckSource,type EventCheck,type GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { type CardObject,type Permanent,Spell } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,MONS_GOBLIN_RAIDERS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
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
