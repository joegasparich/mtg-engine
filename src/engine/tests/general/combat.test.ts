import { PlayerActions } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_Advance,GameEvent_ChangeCardZone,GameEvent_DealDamage,GameEvent_DeclareAttacker,GameEvent_GoToNextStep,GameEvent_GoToNextTurn,GameEvent_GoToStep } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import type { CardObject,Permanent } from "@engine/GameObject";
import { addTestCard,AIR_ELEMENTAL,BASIC_DECK,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,MOUNTAIN,moveTestCard,passPriorityRound } from "@engine/tests/testData";
import { BasicLandType,Keyword } from "~/defs";
import { cardData } from "~/index";

let playerA: Player;
let playerB: Player;

beforeEach(async () => {
    game?.reset();
    Game.init();
    game.players.length = 0;
    playerA = game.addPlayer(BASIC_DECK);
    playerB = game.addPlayer(BASIC_DECK);
});

test("should trade", () => {
    const bearsA = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const bearsB = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bearsA).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(bearsA.tapped).toBe(true);
    (new PlayerActions.DeclareBlocker(bearsB).perform(playerB, [bearsA]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(playerA.graveyard.objects).toContainEqual(expect.objectContaining({ card: bearsA.card }));
    expect(playerB.graveyard.objects).toContainEqual(expect.objectContaining({ card: bearsB.card }));
});

test("a confirmed blocker remains blocking after its attacker leaves until combat ends", () => {
    const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(playerA, [playerB]);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
    new PlayerActions.DeclareBlocker(blocker).perform(playerB, [attacker]);
    expect(CombatManager.isBlocking(blocker)).toBe(false);
    gameEventManager.addEvent(new GameEvent_Advance(playerB));
    expect(CombatManager.isBlocking(blocker)).toBe(true);
    moveTestCard(attacker, playerA.hand);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));
    expect(CombatManager.isBlocking(blocker)).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
    expect(CombatManager.isBlocking(blocker)).toBe(false);
});

describe("first strike and double strike", () => {
    function beginDamage(attackers: Permanent[], blocks: [Permanent, Permanent][] = []) {
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        for (const attacker of attackers)
            new PlayerActions.DeclareAttacker(attacker).perform(playerA, [playerB]);
        gameEventManager.addEvent(new GameEvent_Advance(playerA));
        passPriorityRound();

        for (const [blocker, attacker] of blocks)
            new PlayerActions.DeclareBlocker(blocker).perform(playerB, [attacker]);
        gameEventManager.addEvent(new GameEvent_Advance(playerB));
        passPriorityRound();
    }

    test.each(["attacker", "blocker"])("a first-striking %s survives lethal combat", firstStriker => {
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
        const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
        const [winner, loser] = firstStriker === "attacker" ? [attacker, blocker] : [blocker, attacker];
        winner.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, winner);

        beginDamage([attacker], [[blocker, attacker]]);

        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(loser.retired).toBe(true);
        expect(winner.damageTaken).toBe(0);
        expect(game.priorityPlayer).toBe(playerA);

        passPriorityRound();
        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(winner.damageTaken).toBe(0);
        expect(playerB.life).toBe(20);
    });

    test("a first striker outside combat does not add a combat damage step", () => {
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
        const bystander = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
        bystander.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, bystander);

        beginDamage([attacker]);

        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(playerB.life).toBe(18);
        passPriorityRound();
        expect(game.currentStepIndex).toBe(StepIndex.EndOfCombat);
    });

    test.each([0, 2])("regular damage uses the first strike snapshot even at first-step power %i", power => {
        const first = addTestCard({ ...cardData[GRIZZLY_BEARS], power }, playerA, playerA.battlefield);
        const second = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
        const { revoke } = first.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, first);

        beginDamage([first, second]);
        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(playerB.life).toBe(20 - power);

        revoke();
        first.power = 2;
        second.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, second);
        passPriorityRound();

        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(playerB.life).toBe(18 - power);
    });

    test("double strike by itself creates two damage steps", () => {
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
        attacker.grantAbility({ keyword: Keyword.DoubleStrike, parts: {} }, attacker);

        beginDamage([attacker]);
        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(playerB.life).toBe(18);
        passPriorityRound();

        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(playerB.life).toBe(16);
    });

    test("double strike can be gained or lost before regular damage", () => {
        const [keepsStrike, losesStrike, gainsStrike] = Array.from({ length: 3 },
            () => addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield));
        const doubleStrike = { keyword: Keyword.DoubleStrike, parts: {} };
        keepsStrike.grantAbility(doubleStrike, keepsStrike);
        const { revoke } = losesStrike.grantAbility(doubleStrike, losesStrike);
        // 702.4d: A creature that already has first strike can gain a second hit.
        gainsStrike.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, gainsStrike);

        const hits: CardObject[] = [];
        gameEventManager.onGamePerformed(GameEventType.DealDamage, (event: GameEvent_DealDamage) => {
            if (event.recipient === playerB)
                hits.push(event.source);
        });
        beginDamage([keepsStrike, losesStrike, gainsStrike]);
        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(hits).toEqual([keepsStrike, losesStrike, gainsStrike]);

        revoke();
        gainsStrike.grantAbility(doubleStrike, gainsStrike);
        passPriorityRound();

        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(hits.slice(3)).toEqual([keepsStrike, gainsStrike]);
    });

    test("a first strike damage split resolves before priority and remaining blockers deal regular damage", () => {
        const attacker = addTestCard({ ...cardData[GRIZZLY_BEARS], toughness: 3 }, playerA, playerA.battlefield);
        const first = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
        const second = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
        attacker.grantAbility({ keyword: Keyword.FirstStrike, parts: {} }, attacker);

        beginDamage([attacker], [[first, attacker], [second, attacker]]);
        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(game.priorityPlayer).toBeNull();
        const choice = game.pendingCombatDamageChoice;
        expect(choice).toMatchObject({ player: playerA, source: attacker, recipients: [first, second], total: 2 });
        choice.submit(playerA, [2, 0]);

        expect(first.retired).toBe(true);
        expect(attacker.damageTaken).toBe(0);
        expect(game.priorityPlayer).toBe(playerA);
        passPriorityRound();

        expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
        expect(attacker.damageTaken).toBe(2);
        expect(second.damageTaken).toBe(0);
    });
});

test("unblocked attackers deal player damage simultaneously with blocked combat damage", () => {
    const blocked = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const unblocked = addTestCard(cardData[MONS_GOBLIN_RAIDERS], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [blocked, unblocked])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA, [playerB]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    new PlayerActions.DeclareBlocker(blocker).perform(playerB, [blocked]);

    const observeDamage = vi.fn((event: GameEvent_DealDamage) => {
        expect(blocked.damageTaken).toBe(2);
        expect(blocker.damageTaken).toBe(2);
        expect(playerB.life).toBe(19);
        expect(event.source).toBe(unblocked);
    });
    gameEventManager.onGamePerformed(GameEventType.DealDamage, observeDamage, { matches: event => event.recipient === playerB });
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(observeDamage).toHaveBeenCalledOnce();
});

test("a blocked attacker deals no player damage after its blocker leaves combat", () => {
    const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(playerA, [playerB]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    new PlayerActions.DeclareBlocker(blocker).perform(playerB, [attacker]);
    gameEventManager.addEvent(new GameEvent_Advance(playerB));
    expect(CombatManager.isBlocked(attacker)).toBe(true);
    blocker.destroy();

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(playerB.life).toBe(20);
});

test("attacker should win", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const goblins = addTestCard(cardData[MONS_GOBLIN_RAIDERS], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bears).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    (new PlayerActions.DeclareBlocker(goblins).perform(playerB, [bears]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(bears.zone).toBe(playerA.battlefield);
    expect(playerB.graveyard.objects).toContainEqual(expect.objectContaining({ card: goblins.card }));
});

test("blocker should win", () => {
    const goblins = addTestCard(cardData[MONS_GOBLIN_RAIDERS], playerA, playerA.battlefield);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(goblins).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    (new PlayerActions.DeclareBlocker(bears).perform(playerB, [goblins]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));

    expect(playerA.graveyard.objects).toContainEqual(expect.objectContaining({ card: goblins.card }));
    expect(bears.zone).toBe(playerB.battlefield);
});

test("defender prevents attacking and allows blocking", () => {
    const defender = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ keyword: Keyword.Defender, parts: {} }],
    }, playerA, playerA.battlefield);
    const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    expect(playerActionManager.getCardActions(defender, playerA)).toHaveLength(0);
    new PlayerActions.DeclareAttacker(defender).perform(playerA);
    expect(CombatManager.attackingCreatures.has(defender)).toBe(false);

    gameEventManager.addEvent(new GameEvent_GoToNextTurn());
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(playerB);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const [block] = playerActionManager.getCardActions(defender, playerA);
    expect(block).toBeInstanceOf(PlayerActions.DeclareBlocker);
    block.perform(playerA, [attacker]);
    expect(CombatManager.blockingCreatures.get(defender)).toEqual(new Set([attacker]));
});

test("defender only intercepts attacker checks on the battlefield", () => {
    const defender = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ keyword: Keyword.Defender, parts: {} }],
    }, playerA, playerA.battlefield);
    const declaration = new GameEvent_DeclareAttacker(defender);

    expect(gameEventManager.checkEvent(declaration)).toBe(false);

    gameEventManager.addEvent(new GameEvent_ChangeCardZone(defender, playerA.graveyard));
    expect(gameEventManager.checkEvent(declaration)).toBe(true);
});

test("flyer can't be blocked by non flyer", () => {
    const elemental = addTestCard(cardData[AIR_ELEMENTAL], playerA, playerA.battlefield);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(elemental).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(bears, playerB, false).length).toBe(0);
});

test("islandwalk prevents blocks while the defender controls a land with the Island subtype", () => {
    const island = cardData.find(card => card.name === BasicLandType.Island);
    const islandwalker = { ...cardData[GRIZZLY_BEARS], abilities: [{ keyword: Keyword.Islandwalk, parts: {} }] };
    const attacker = addTestCard(islandwalker, playerA, playerA.battlefield);
    const blocker = addTestCard(islandwalker, playerB, playerB.battlefield);
    addTestCard(island, playerA, playerA.battlefield);
    addTestCard(island, playerB, playerB.hand);
    const land = addTestCard(cardData[MOUNTAIN], playerB, playerB.battlefield);

    game.startGame({ allowAutoSkip: false });
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(playerA, [playerB]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(CombatManager.canBlockAttacker(blocker, attacker)).toBe(true);
    land.subtypes = [BasicLandType.Mountain, BasicLandType.Island];
    expect(CombatManager.canBlockAttacker(blocker, attacker)).toBe(false);
    moveTestCard(land, playerB.graveyard);
    expect(CombatManager.canBlockAttacker(blocker, attacker)).toBe(true);
});

test("non flyer can be blocked by flyer", () => {
    const bears = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const elemental = addTestCard(cardData[AIR_ELEMENTAL], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(bears).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(elemental, playerB, false).length).toBe(1);
});

test("flyer can be blocked by flyer", () => {
    const elementalA = addTestCard(cardData[AIR_ELEMENTAL], playerA, playerA.battlefield);
    const elementalB = addTestCard(cardData[AIR_ELEMENTAL], playerB, playerB.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    (new PlayerActions.DeclareAttacker(elementalA).perform(playerA, [playerB]));
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(playerActionManager.getCardActions(elementalB, playerB, false).length).toBe(1);
});

test("can withdraw an attacker before confirming and only taps confirmed attackers", () => {
    const withdrawn = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const attacking = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    const edit = new PlayerActions.DeclareAttacker(withdrawn);
    const keep = new PlayerActions.DeclareAttacker(attacking);
    edit.perform(playerA);
    keep.perform(playerA);

    expect(edit.withdraw(playerB)).toBe(false);
    expect(edit.withdraw(playerA)).toBe(true);
    expect([...CombatManager.attackingCreatures.keys()]).toEqual([attacking]);
    expect(attacking.tapped).toBe(false);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(withdrawn.tapped).toBe(false);
    expect(attacking.tapped).toBe(true);
    expect(keep.withdraw(playerA)).toBe(false);
});

test("can reassign and withdraw a block while keeping the previous assignment after an illegal edit", () => {
    const first = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const flying = addTestCard(cardData[AIR_ELEMENTAL], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);
    const attackers = [first, second, flying];

    game.startGame({allowAutoSkip: false});
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of attackers)
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const edit = new PlayerActions.DeclareBlocker(blocker);
    edit.perform(playerB, [first]);
    edit.perform(playerB, [flying]);
    expect(CombatManager.blockingCreatures.get(blocker)).toEqual(new Set([first]));

    edit.perform(playerB, [second]);
    expect([...CombatManager.blockingCreatures]).toEqual([[blocker, new Set([second])]]);
    expect(edit.withdraw(playerA)).toBe(false);
    expect(edit.withdraw(playerB)).toBe(true);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);

    edit.perform(playerB, [second]);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(second, playerA.graveyard));
    expect(CombatManager.attackingCreatures.has(second)).toBe(false);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);
    edit.perform(playerB, [second]);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);
});

test("permission to block multiple attackers leaves the choice of blocks to the defender", () => {
    const first = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blocker = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_BlockAnyNumber: {} } }],
    }, playerB, playerB.battlefield);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [first, second])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(CombatManager.canConfirmBlocks()).toBe(true);
    const block = new PlayerActions.DeclareBlocker(blocker);
    block.perform(playerB, [first]);
    expect(CombatManager.canConfirmBlocks()).toBe(true);
    block.perform(playerB, [second]);
    expect(CombatManager.blockingCreatures.get(blocker)).toEqual(new Set([first, second]));

    gameEventManager.addEvent(new GameEvent_ChangeCardZone(first, playerA.graveyard));
    expect(CombatManager.blockingCreatures.get(blocker)).toEqual(new Set([second]));
    expect(CombatManager.canConfirmBlocks()).toBe(true);
});

function addBandingCreature(player: Player) {
    return addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ keyword: Keyword.Banding, parts: {} }],
    }, player, player.battlefield);
}

test("validates and edits multiple bands during attacker declaration", () => {
    const bander = addBandingCreature(playerA);
    const secondBander = addBandingCreature(playerA);
    const first = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const otherDefender = game.addPlayer(BASIC_DECK);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    expect(CombatManager.setAttackingBands(playerA, [[bander, first]])).toBe(false);
    for (const attacker of [bander, secondBander, first, second])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);

    expect(CombatManager.setAttackingBands(playerA, [[first, second]])).toBe(false);
    expect(CombatManager.setAttackingBands(playerA, [[bander, first, second]])).toBe(false);
    expect(CombatManager.setAttackingBands(playerA, [[bander, first], [bander, second]])).toBe(false);
    expect(CombatManager.setAttackingBands(playerB, [[bander, first]])).toBe(false);
    CombatManager.attackingCreatures.set(second, otherDefender);
    expect(CombatManager.setAttackingBands(playerA, [[secondBander, second]])).toBe(false);
    CombatManager.attackingCreatures.set(second, playerB);

    expect(CombatManager.setAttackingBands(playerA, [[bander, secondBander, first]])).toBe(true);
    expect(CombatManager.setAttackingBands(playerA, [[bander, first], [secondBander, second]])).toBe(true);
    expect(new PlayerActions.DeclareAttacker(bander).withdraw(playerA)).toBe(true);
    expect(CombatManager.attackingBands).toEqual([new Set([secondBander, second])]);
    expect(CombatManager.setAttackingBands(playerA, [[secondBander, first]])).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(CombatManager.setAttackingBands(playerA, [])).toBe(false);
    expect(CombatManager.attackingBands).toEqual([new Set([secondBander, first])]);
});

test("a legal ground block also blocks a flyer in the band, even if the declared target leaves", () => {
    const bander = addBandingCreature(playerA);
    const flyer = addTestCard(cardData[AIR_ELEMENTAL], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [bander, flyer])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    expect(CombatManager.setAttackingBands(playerA, [[bander, flyer]])).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const block = new PlayerActions.DeclareBlocker(blocker);
    block.perform(playerB, [flyer]);
    expect(CombatManager.blockingCreatures.has(blocker)).toBe(false);
    block.perform(playerB, [bander]);
    expect([...CombatManager.blockRelationships()]).toEqual([[blocker, bander], [blocker, flyer]]);
    CombatManager.confirmBlocks();
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(bander, playerA.graveyard));
    expect(CombatManager.attackingBands).toEqual([new Set([flyer])]);
    expect([...CombatManager.blockRelationships()]).toEqual([[blocker, flyer]]);

    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(flyer.damageTaken).toBe(2);
    expect(blocker.retired).toBe(true);
    expect([...CombatManager.blockRelationships()]).toEqual([]);
    expect(CombatManager.isBlocked(flyer)).toBe(true);
});

test("a declared band persists after losing banding and an effect can block the whole band", () => {
    const bander = addBandingCreature(playerA);
    const attacker = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[AIR_ELEMENTAL], playerB, playerB.battlefield);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const member of [bander, attacker])
        new PlayerActions.DeclareAttacker(member).perform(playerA);
    expect(CombatManager.setAttackingBands(playerA, [[bander, attacker]])).toBe(true);

    const abilities = bander.abilities;
    bander.abilities = [];
    expect(game.nextStep(false)).toBe(false);
    bander.abilities = abilities;
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    bander.abilities = [];
    abilities.forEach(ability => ability.cleanup());

    CombatManager.markBlocked(attacker);
    expect(CombatManager.isBlocked(bander)).toBe(true);
    expect(CombatManager.isBlocked(attacker)).toBe(true);
    expect([...CombatManager.blockRelationships()]).toEqual([]);

    new PlayerActions.DeclareBlocker(blocker).perform(playerB, [attacker]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    expect(game.pendingCombatDamageChoice).toMatchObject({ player: playerB, source: blocker, recipients: [bander, attacker] });
    game.pendingCombatDamageChoice.submit(playerB, [0, 4]);
    expect(bander.zone).toBe(playerA.battlefield);
    expect(attacker.retired).toBe(true);
    expect(blocker.retired).toBe(true);
});

test("an attacking creature with banding lets the attacker assign the blocker's damage", () => {
    const bander = addBandingCreature(playerA);
    const partner = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [bander, partner])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    expect(CombatManager.setAttackingBands(playerA, [[bander, partner]])).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    new PlayerActions.DeclareBlocker(blocker).perform(playerB, [partner]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const choice = game.pendingCombatDamageChoice;
    expect(choice).toMatchObject({ player: playerA, source: blocker, recipients: [bander, partner], total: 2 });
    choice.submit(playerA, [2, 0]);
    expect(bander.retired).toBe(true);
    expect(partner.damageTaken).toBe(0);
    expect(blocker.damageTaken).toBe(4);
});

test("a blocking creature with banding lets the defender assign the attacker's damage", () => {
    const attacker = addTestCard({ ...cardData[GRIZZLY_BEARS], power: 4, toughness: 4 }, playerA, playerA.battlefield);
    const bander = addBandingCreature(playerB);
    const partner = addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    for (const blocker of [bander, partner])
        new PlayerActions.DeclareBlocker(blocker).perform(playerB, [attacker]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    const choice = game.pendingCombatDamageChoice;
    expect(choice).toMatchObject({ player: playerB, source: attacker, recipients: [bander, partner], total: 4 });
    choice.submit(playerB, [4, 0]);
    expect(bander.retired).toBe(true);
    expect(partner.damageTaken).toBe(0);
    expect(attacker.damageTaken).toBe(4);
});

test("collects and validates normal damage splits before dealing all assigned damage together", () => {
    const first = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const second = addTestCard(cardData[GRIZZLY_BEARS], playerA, playerA.battlefield);
    const blockers = Array.from({ length: 4 }, () => addTestCard(cardData[GRIZZLY_BEARS], playerB, playerB.battlefield));
    blockers[0].damageTaken = 1;

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const attacker of [first, second])
        new PlayerActions.DeclareAttacker(attacker).perform(playerA);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    blockers.forEach((blocker, index) => new PlayerActions.DeclareBlocker(blocker).perform(playerB, [index < 2 ? first : second]));
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.EndOfCombat));
    const choice = game.pendingCombatDamageChoice;
    expect(choice).toMatchObject({ player: playerA, source: first, recipients: blockers.slice(0, 2), total: 2 });
    expect(game.currentStepIndex).toBe(StepIndex.CombatDamage);
    expect(game.nextStep(false)).toBe(false);
    expect(playerActionManager.getAvailableActions(playerA).size).toBe(0);
    choice.submit(playerB, [1, 1]);
    for (const amounts of [[2], [1, 0], [2, 1], [-1, 3], [0.5, 1.5], [NaN, 2]])
        choice.submit(playerA, amounts);
    expect(game.pendingCombatDamageChoice).toBe(choice);

    choice.submit(playerA, [1, 1]);
    const next = game.pendingCombatDamageChoice;
    expect(next).toMatchObject({ player: playerA, source: second, recipients: blockers.slice(2), total: 2 });
    expect(blockers.map(blocker => blocker.damageTaken)).toEqual([1, 0, 0, 0]);
    expect(first.damageTaken).toBe(0);
    choice.submit(playerA, [0, 2]);
    expect(game.pendingCombatDamageChoice).toBe(next);

    next.submit(playerA, [0, 2]);
    expect(game.pendingCombatDamageChoice).toBeNull();
    expect(game.currentStepIndex).toBe(StepIndex.EndOfCombat);
    expect(blockers.map(blocker => blocker.damageTaken)).toEqual([2, 1, 0, 2]);
    expect([first, second].map(attacker => attacker.damageTaken)).toEqual([4, 4]);
    expect(playerA.graveyard.objects.map(object => object.card)).toEqual(expect.arrayContaining([first.card, second.card]));
    expect(playerB.graveyard.objects.map(object => object.card)).toEqual(expect.arrayContaining([blockers[0].card, blockers[3].card]));
});
