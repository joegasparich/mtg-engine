import playerActionManager,{ TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { PlayerActions } from "@engine/actions";
import { type CardObject,type Permanent,StackAbility } from "@engine/GameObject";
import type { Zone } from "@engine/Zone";
import { CombatManager } from "@engine/CombatManager";
import { CardChoiceVisibility,GameEvent_ActivateAbility,GameEvent_Advance,GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_Cleanup,GameEvent_DealDamage,GameEvent_DeclareAttacker,GameEvent_DestroyPermanent,GameEvent_DrawCard,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_TapCard,GameEvent_UntapCard,ManaPaymentDecision,OptionalDecision } from "@engine/events";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import { GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import { GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,BASIC_DECK,FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { BasicLandType,type CardDef,CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

describe("Disenchant", () => {
    const def = cardData.find(card => card.name === "Disenchant");
    const castle = cardData.find(card => card.name === "Castle");
    const artifact: CardDef = { ...castle, name: "Test artifact", type: CardType.Artifact, abilities: [] };
    const plains = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    test.each([artifact, castle])("casts for {1}{W} and destroys $name", targetDef => {
        const card = addTestCard(def, caster, caster.hand);
        const whiteSource = addTestCard(plains, caster, caster.battlefield);
        const target = addTestCard(targetDef, opponent, opponent.battlefield);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);

        const genericSource = addTestCard(cardData[FOREST], caster, caster.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const cardInHand = addTestCard(targetDef, opponent, opponent.hand);
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([creature])).toBe(false);
        expect(game.pendingTargeter.validateTargets([cardInHand])).toBe(false);
        expect(game.pendingTargeter.validateTargets([])).toBe(false);
        game.pendingTargeter.onTargeted([target]);
        expect(whiteSource.tapped && genericSource.tapped).toBe(true);
        expect(target.zone).toBe(opponent.battlefield);

        passPriorityRound();
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([target.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
    });

    test("fails to destroy a target that leaves and returns before resolution", () => {
        const card = addTestCard(def, caster, caster.hand);
        const target = addTestCard(castle, opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, card, [target])).toBe(true);
        const returned = moveTestCard(moveTestCard(target, opponent.hand), opponent.battlefield);

        passPriorityRound();
        expect(returned.zone).toBe(opponent.battlefield);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
    });
});

describe("Guardian Angel", () => {
    const def = cardData.find(card => card.name === "Guardian Angel");
    const plains = cardData.find(card => card.name === "Plains");
    const damageSpellDef: CardDef = {
        ...cardData[ANCESTRAL_RECALL],
        name: "Test damage spell",
        type: CardType.Instant,
        cost: "{R}",
        abilities: [{ parts: {
            AbilityPart_Target: {
                saveAs: "VICTIM", validTargets: ["Card"],
                targetValidator: { cardType: CardType.Creature, onBattlefield: true },
            },
            AbilityPart_Effect_DealDamage: { inSignal: "SPELL_RESOLVE", source: "THIS", target: "VICTIM", amount: 3 },
        } }],
    };
    let caster: Player;
    let opponent: Player;
    let card: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
        card = addTestCard(def, caster, caster.hand);
    });

    function cast(x: number, target: Player | Permanent) {
        const [action] = playerActionManager.getCardActions(card, caster);
        action.perform(caster);
        game.pendingSpellXChoice.submit(caster, x);
        game.pendingTargeter.onTargeted([target]);
        expect(game.stack.objects.at(-1)).toMatchObject({ card: card.card, chosenX: x, targets: [target] });
    }

    test("pays {X}{W} and prevents damage to the chosen player across hits", () => {
        const whiteSource = addTestCard(plains, caster, caster.battlefield);
        const genericSource = addTestCard(cardData[FOREST], caster, caster.battlefield);
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], caster, caster.battlefield);
        caster.manaPool[ManaColour.R] = 1;
        const [action] = playerActionManager.getCardActions(card, caster);
        action.perform(caster);

        expect(game.pendingTargeter).toBeNull();
        expect(game.pendingSpellXChoice.max).toBe(2);
        game.pendingSpellXChoice.submit(caster, 2);
        expect(game.pendingTargeter.validateTargets([whiteSource])).toBe(false);
        expect(game.pendingTargeter.validateTargets([source])).toBe(true);
        expect(whiteSource.tapped || genericSource.tapped).toBe(false);
        game.pendingTargeter.onTargeted([opponent]);
        expect([whiteSource.tapped, genericSource.tapped]).toEqual([true, true]);
        expect(caster.manaPool[ManaColour.R]).toBe(0);
        expect(game.stack.objects.at(-1)).toMatchObject({ chosenX: 2 });
        passPriorityRound();

        gameEventManager.addEvent(new GameEvent_DealDamage(source, opponent, 1));
        expect(opponent.life).toBe(20);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, caster, 1));
        gameEventManager.addEvent(new GameEvent_DealDamage(source, opponent, 3));
        expect([caster.life, opponent.life]).toEqual([19, 18]);
    });

    test("X = 0 still allows repeat payments with a damaging spell on the stack", () => {
        const victim = addTestCard(cardData.find(def => def.name === "Air Elemental"), opponent, opponent.battlefield);
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
        const untappedLand = addTestCard(cardData[FOREST], caster, caster.battlefield);
        const damageSpell = addTestCard(damageSpellDef, opponent, opponent.hand);
        caster.manaPool[ManaColour.W] = 1;
        caster.manaPool[ManaColour.G] = 1;
        cast(0, victim);
        const spell = game.stack.objects.at(-1);
        passPriorityRound();
        expect(caster.graveyard.objects[0].card).toBe(card.card);
        moveTestCard(caster.graveyard.objects[0], caster.hand);

        gameEventManager.addEvent(new GameEvent_DealDamage(source, victim, 1));
        expect(victim.damageTaken).toBe(1);
        gameEventManager.addEvent(new GameEvent_Advance(caster));
        expect(game.getSpecialActions(opponent)).toEqual([]);
        opponent.manaPool[ManaColour.R] = 1;
        new PlayerActions.PlayCard(damageSpell).perform(opponent);
        game.pendingTargeter.onTargeted([victim]);
        gameEventManager.addEvent(new GameEvent_Advance(opponent));

        const [payment] = game.getSpecialActions(caster);
        expect(payment.label).toBe("Pay {1} to prevent 1 damage to Air Elemental");
        expect(payment.ability.source).toBe(spell);
        expect(spell.retired).toBe(true);
        game.takeSpecialAction(caster, payment);
        expect(untappedLand.tapped).toBe(false);
        game.takeSpecialAction(caster, payment);
        expect(untappedLand.tapped).toBe(true);
        expect(game.getSpecialActions(caster)).toEqual([]);
        expect(game.priorityPlayer).toBe(caster);
        expect(game.stack.objects).toHaveLength(1);

        gameEventManager.addEvent(new GameEvent_Advance(caster));
        expect(game.priorityPlayer).toBe(opponent);
        expect(game.stack.objects).toHaveLength(1);
        gameEventManager.addEvent(new GameEvent_Advance(opponent));
        expect(victim.damageTaken).toBe(2);
        expect(game.stack.objects).toHaveLength(0);
    });

    test("X = 1 and a paid shield both prevent damage without a redundant order choice", () => {
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 3;
        cast(1, caster);
        passPriorityRound();
        const [payment] = game.getSpecialActions(caster);
        game.takeSpecialAction(caster, payment);

        gameEventManager.addEvent(new GameEvent_DealDamage(source, caster, 2));
        expect(game.pendingDamagePreventionChoice).toBeNull();
        expect(caster.life).toBe(20);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, caster, 1));
        expect(caster.life).toBe(19);
    });

    test("a target that leaves before resolution prevents the spell from creating either effect", () => {
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 3;
        cast(1, creature);
        const returned = moveTestCard(moveTestCard(creature, opponent.hand), opponent.battlefield);
        passPriorityRound();

        expect(caster.graveyard.objects[0].card).toBe(card.card);
        expect(game.getSpecialActions(caster)).toEqual([]);
        gameEventManager.addEvent(new GameEvent_DealDamage(returned, returned, 1));
        expect(returned.damageTaken).toBe(1);
    });

    test("shields and later payments refer to the original creature and expire at cleanup", () => {
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 4;
        cast(1, creature);
        passPriorityRound();
        const [payment] = game.getSpecialActions(caster);
        const returned = moveTestCard(moveTestCard(creature, opponent.hand), opponent.battlefield);
        game.takeSpecialAction(caster, payment);
        gameEventManager.addEvent(new GameEvent_DealDamage(returned, returned, 1));
        expect(returned.damageTaken).toBe(1);

        const next = addTestCard(def, caster, caster.hand);
        caster.manaPool[ManaColour.W] = 2;
        new PlayerActions.PlayCard(next).perform(caster);
        game.pendingSpellXChoice.submit(caster, 1);
        game.pendingTargeter.onTargeted([caster]);
        passPriorityRound();
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        gameEventManager.addEvent(new GameEvent_DealDamage(source, caster, 1));
        expect(caster.life).toBe(19);
        expect(returned.damageTaken).toBe(0);

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        // The next main phase belongs to the opponent. Give the original caster priority again.
        gameEventManager.addEvent(new GameEvent_Advance(opponent));
        expect(game.priorityPlayer).toBe(caster);
        caster.manaPool[ManaColour.W] = 1;
        expect(game.getSpecialActions(caster)).toEqual([]);
        game.takeSpecialAction(caster, payment);
        expect(caster.manaPool[ManaColour.W]).toBe(1);
    });
});

describe("Healing Salve", () => {
    const def = cardData.find(card => card.name === "Healing Salve");
    let caster: Player;
    let opponent: Player;
    let card: CardObject;
    let bear: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
        card = addTestCard(def, caster, caster.hand);
        bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 1;
    });

    function chooseMode(mode: number) {
        const [action] = playerActionManager.getCardActions(card, caster);
        action.perform(caster);
        expect(game.pendingSpellModeChoice.options).toEqual([
            { text: "Target player gains 3 life.", enabled: true },
            { text: "Prevent the next 3 damage that would be dealt to any target this turn.", enabled: true },
        ]);
        game.pendingSpellModeChoice.submit(caster, mode);
        expect(caster.manaPool[ManaColour.W]).toBe(1);
        return game.pendingTargeter;
    }

    test("gives the targeted player 3 life", () => {
        const targeting = chooseMode(0);
        expect(targeting.validateTargets([bear])).toBe(false);
        targeting.onTargeted([opponent]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(opponent.life).toBe(20);
        passPriorityRound();
        expect([caster.life, opponent.life]).toEqual([20, 23]);
        gameEventManager.addEvent(new GameEvent_DealDamage(bear, opponent, 1));
        expect(opponent.life).toBe(22);
        expect(caster.graveyard.objects[0].card).toBe(card.card);
    });

    test("prevents 3 damage to a creature across multiple hits", () => {
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], caster, caster.battlefield);
        const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        const targeting = chooseMode(1);
        expect(targeting.validateTargets([land])).toBe(false);
        targeting.onTargeted([bear]);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(source, bear, 2));
        expect(bear.damageTaken).toBe(0);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, bear, 2));
        expect(bear.damageTaken).toBe(1);
        expect([caster.life, opponent.life]).toEqual([20, 20]);
    });

    test("prevents damage to a player until cleanup", () => {
        chooseMode(1).onTargeted([caster]);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(bear, caster, 1));
        expect(caster.life).toBe(20);
        gameEventManager.addEvent(new GameEvent_Cleanup(caster));
        gameEventManager.addEvent(new GameEvent_DealDamage(bear, caster, 2));
        expect(caster.life).toBe(18);
    });

    test("does not shield a creature that left and returned before resolution", () => {
        chooseMode(1).onTargeted([bear]);
        const returned = moveTestCard(moveTestCard(bear, opponent.hand), opponent.battlefield);
        passPriorityRound();
        const source = addTestCard(cardData[MONS_GOBLIN_RAIDERS], caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, returned, 1));
        expect(returned.damageTaken).toBe(1);
        expect(caster.graveyard.objects[0].card).toBe(card.card);
    });
});

describe("Farmstead", () => {
    const def = cardData.find(card => card.name === "Farmstead");
    const plains = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    function beginNextUpkeep() {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Upkeep));
    }

    function enchant(land: Permanent) {
        const card = addTestCard(def, caster, caster.hand);
        expect(game.stack.spellCast(caster, card, [land])).toBe(true);
        passPriorityRound();
        return caster.battlefield.objects.find(object => object.card === card.card);
    }

    test("casts for {W}{W}{W} and grants the upkeep payment to the enchanted land's controller", () => {
        const card = addTestCard(def, caster, caster.hand);
        const land = addTestCard(plains, opponent, opponent.battlefield);
        const otherWhiteSource = addTestCard(plains, opponent, opponent.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const landInHand = addTestCard(plains, opponent, opponent.hand);
        const first = addTestCard(plains, caster, caster.battlefield);
        const second = addTestCard(plains, caster, caster.battlefield);
        const forest = addTestCard(cardData[FOREST], caster, caster.battlefield);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);

        const third = addTestCard(plains, caster, caster.battlefield);
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([creature])).toBe(false);
        expect(game.pendingTargeter.validateTargets([landInHand])).toBe(false);
        game.pendingTargeter.onTargeted([land]);
        expect([first.tapped, second.tapped, third.tapped, forest.tapped]).toEqual([true, true, true, false]);
        passPriorityRound();
        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(land);

        beginNextUpkeep();
        expect(game.stack.objects).toEqual([expect.objectContaining({ source: land, controller: opponent })]);
        expect(game.pendingManaPaymentChoice).toBeNull();
        passPriorityRound();
        const choice = game.pendingManaPaymentChoice;
        expect(choice).toMatchObject({ player: opponent, cost: "{W}{W}" });
        choice.submit(caster, ManaPaymentDecision.Pay);
        expect(game.pendingManaPaymentChoice).toBe(choice);
        expect(opponent.life).toBe(20);
        choice.submit(opponent, ManaPaymentDecision.Pay);
        expect(opponent.life).toBe(21);
        expect(caster.life).toBe(20);
        expect(land.tapped && otherWhiteSource.tapped).toBe(true);
        expect(opponent.manaPool[ManaColour.W]).toBe(0);
        expect(game.stack.objects).toHaveLength(0);

        beginNextUpkeep();
        expect(game.currentTurnPlayer()).toBe(caster);
        expect(game.stack.objects).toHaveLength(0);
    });

    test.each([true, false])("leaves the Aura attached without gaining life when payment is skipped (can pay: %s)", canPay => {
        const land = addTestCard(plains, opponent, opponent.battlefield);
        const secondLand = addTestCard(canPay ? plains : cardData[FOREST], opponent, opponent.battlefield);
        const aura = enchant(land);

        beginNextUpkeep();
        passPriorityRound();
        if (canPay) {
            expect(game.pendingManaPaymentChoice).toMatchObject({ player: opponent });
            game.pendingManaPaymentChoice.submit(opponent, ManaPaymentDecision.Decline);
        }

        expect(game.pendingManaPaymentChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(aura.zone).toBe(caster.battlefield);
        expect(aura.attachedTo).toBe(land);
        expect(opponent.life).toBe(20);
        expect(land.tapped || secondLand.tapped).toBe(false);
    });

    test("resolves an existing upkeep trigger after the Aura is destroyed and stops granting new ones", () => {
        const land = addTestCard(plains, opponent, opponent.battlefield);
        addTestCard(plains, opponent, opponent.battlefield);
        const aura = enchant(land);
        beginNextUpkeep();
        expect(game.stack.objects[0]).toBeInstanceOf(StackAbility);
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(aura));
        expect(land.abilities.every(ability => ability.grantedBy !== aura)).toBe(true);

        passPriorityRound();
        game.pendingManaPaymentChoice.submit(opponent, ManaPaymentDecision.Pay);
        expect(opponent.life).toBe(21);

        beginNextUpkeep();
        beginNextUpkeep();
        expect(game.currentTurnPlayer()).toBe(opponent);
        expect(game.stack.objects).toHaveLength(0);
    });
});

describe("Death Ward", () => {
    const deathWard = cardData.find(card => card.name === "Death Ward");
    const bears = cardData[GRIZZLY_BEARS];
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    test("casts for one white mana and shields an opponent's creature from a spell below it", () => {
        const ward = addTestCard(deathWard, caster, caster.hand);
        const creature = addTestCard(bears, opponent, opponent.battlefield);
        const creatureInHand = addTestCard(bears, opponent, opponent.hand);
        const plains = addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield);
        const removal = addTestCard({ ...deathWard, name: "Test destruction spell", abilities: [{ parts: {
            AbilityPart_Target: {
                saveAs: "TARGET", validTargets: [TargetTypeKeys.Card],
                targetValidator: { cardType: CardType.Creature, onBattlefield: true },
            },
            AbilityPart_Effect_DestroyPermanents: { inSignal: "SPELL_RESOLVE", permanentsFrom: "TARGET" },
        } }] }, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, removal, [creature])).toBe(true);
        creature.damageTaken = 1;

        const [cast] = playerActionManager.getCardActions(ward, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([plains])).toBe(false);
        expect(game.pendingTargeter.validateTargets([creatureInHand])).toBe(false);
        game.pendingTargeter.onTargeted([creature]);
        expect(plains.tapped).toBe(true);
        expect(game.stack.objects).toEqual([
            expect.objectContaining({ card: removal.card }),
            expect.objectContaining({ card: ward.card }),
        ]);

        passPriorityRound();
        expect(creature).toMatchObject({ tapped: false, damageTaken: 1 });
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([ward.card]);
        passPriorityRound();
        expect(game.stack.objects).toHaveLength(0);
        expect(creature.zone).toBe(opponent.battlefield);
        expect(creature).toMatchObject({ tapped: true, damageTaken: 0 });
    });

    test("fails to shield a target that leaves and returns before resolution", () => {
        const ward = addTestCard(deathWard, caster, caster.hand);
        const creature = addTestCard(bears, opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, ward, [creature])).toBe(true);
        const returned = moveTestCard(moveTestCard(creature, opponent.hand), opponent.battlefield);

        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(returned));
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([ward.card]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([creature.card]);
    });
});

describe("Conversion", () => {
    const def = cardData.find(card => card.name === "Conversion");
    const mountain = cardData.find(card => card.name === "Mountain");
    const plains = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    function beginCasterUpkeep() {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Upkeep));
        expect(game.currentTurnPlayer()).toBe(opponent);
        expect(game.stack.objects).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Upkeep));
        expect(game.currentTurnPlayer()).toBe(caster);
    }

    test("casts for {2}{W}{W} and can use converted Mountains to pay for its upkeep", () => {
        const mountains = [addTestCard(mountain, caster, caster.battlefield), addTestCard(mountain, caster, caster.battlefield)];
        const firstPlains = addTestCard(plains, caster, caster.battlefield);
        const card = addTestCard(def, caster, caster.hand);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        const secondPlains = addTestCard(plains, caster, caster.battlefield);
        const opponentMountain = addTestCard(mountain, opponent, opponent.battlefield);
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect([firstPlains, secondPlains, ...mountains].every(land => land.tapped)).toBe(true);
        expect(opponentMountain.subtypes).toEqual([BasicLandType.Mountain]);
        passPriorityRound();
        const conversion = caster.battlefield.objects.find(object => object.card === card.card);
        expect(opponentMountain.subtypes).toEqual([BasicLandType.Plains]);
        expect(conversion?.zone).toBe(caster.battlefield);

        beginCasterUpkeep();
        expect(game.stack.objects).toHaveLength(1);
        expect(game.stack.objects[0]).toBeInstanceOf(StackAbility);
        expect(game.pendingManaPaymentChoice).toBeNull();
        passPriorityRound();
        const choice = game.pendingManaPaymentChoice;
        expect(choice).toMatchObject({ player: caster, cost: "{W}{W}" });
        expect(game.priorityPlayer).toBeNull();
        choice.submit(opponent, ManaPaymentDecision.Pay);
        expect(game.pendingManaPaymentChoice).toBe(choice);
        choice.submit(caster, ManaPaymentDecision.Pay);

        expect(game.pendingManaPaymentChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(mountains.every(land => land.tapped)).toBe(true);
        expect(firstPlains.tapped || secondPlains.tapped).toBe(false);
        expect(conversion.zone).toBe(caster.battlefield);
    });

    test("declining sacrifices Conversion and restores the mana of newly played Mountains", () => {
        const conversion = addTestCard(def, caster, caster.battlefield);
        const otherLand = addTestCard(mountain, caster, caster.battlefield);
        const inHand = addTestCard(mountain, caster, caster.hand);
        expect(inHand.subtypes).toEqual([BasicLandType.Mountain]);
        const [play] = playerActionManager.getCardActions(inHand, caster);
        play.perform(caster);
        const played = caster.battlefield.objects.find(object => object.card === inHand.card);
        expect(played.name).toBe("Mountain");
        expect(played.subtypes).toEqual([BasicLandType.Plains]);
        const [tap] = playerActionManager.getCardActions(played, caster);
        tap.perform(caster);
        expect(caster.manaPool[ManaColour.W]).toBe(1);
        expect(caster.manaPool[ManaColour.R]).toBe(0);

        beginCasterUpkeep();
        passPriorityRound();
        const whiteManaAbility = played.abilities[0];
        game.pendingManaPaymentChoice.submit(caster, ManaPaymentDecision.Decline);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(conversion.card);
        expect([played.subtypes, otherLand.subtypes]).toEqual([[BasicLandType.Mountain], [BasicLandType.Mountain]]);
        expect(gameEventManager.performImmediate(new GameEvent_ActivateAbility(caster, played, whiteManaAbility))).toBe(false);
        const [tapAgain] = playerActionManager.getCardActions(played, caster);
        tapAgain.perform(caster);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(caster.manaPool[ManaColour.R]).toBe(1);
    });

    test("sacrifices on resolution when the controller cannot pay", () => {
        const conversion = addTestCard(def, caster, caster.battlefield);
        const land = addTestCard(mountain, caster, caster.battlefield);
        beginCasterUpkeep();
        expect(conversion.zone).toBe(caster.battlefield);
        passPriorityRound();
        expect(game.pendingManaPaymentChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(conversion.card);
        expect(land.tapped).toBe(false);
        expect(land.subtypes).toEqual([BasicLandType.Mountain]);
    });

    test("each Conversion applies until it leaves the battlefield", () => {
        const first = addTestCard(def, caster, caster.battlefield);
        const second = addTestCard(def, opponent, opponent.battlefield);
        const land = addTestCard(mountain, caster, caster.battlefield);

        expect(land.subtypes).toEqual([BasicLandType.Plains]);
        moveTestCard(first, caster.graveyard);
        expect(land.subtypes).toEqual([BasicLandType.Plains]);
        moveTestCard(second, opponent.graveyard);
        expect(land.subtypes).toEqual([BasicLandType.Mountain]);
    });
});

test("Circle of Protection: Red prevents one hit from the chosen source to its controller", () => {
    Game.init();
    const caster = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();

    const def = cardData.find(card => card.name === "Circle of Protection: Red");
    expect(def).toMatchObject({ type: CardType.Enchantment, cost: "{1}{W}" });
    const plains = cardData.find(card => card.name === "Plains");
    const castingLands = [addTestCard(plains, caster, caster.battlefield), addTestCard(plains, caster, caster.battlefield)];
    const card = addTestCard(def, caster, caster.hand);
    const [cast] = playerActionManager.getCardActions(card, caster);
    cast.perform(caster);
    passPriorityRound();
    expect(castingLands.every(land => land.tapped)).toBe(true);
    const circle = caster.battlefield.objects.find(object => object.card === card.card);
    expect(playerActionManager.getCardActions(circle, caster)).toEqual([]);

    const land = addTestCard(plains, caster, caster.battlefield);
    const chosen = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
    const other = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
    const wrongColour = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const [activate] = playerActionManager.getCardActions(circle, caster);
    activate.perform(caster);
    expect(land.tapped).toBe(true);
    expect(game.stack.objects.at(-1)).toBeInstanceOf(StackAbility);
    expect(game.pendingResolutionChoice).toBeNull();
    expect(game.pendingTargeter).toBeNull();
    gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 1));
    expect(caster.life).toBe(19);

    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice.player).toBe(caster);
    expect(choice.options).toEqual([chosen, other]);
    choice.submit(opponent, [chosen]);
    choice.submit(caster, [wrongColour]);
    expect(game.pendingResolutionChoice).toBe(choice);
    choice.submit(caster, [chosen]);
    expect(game.pendingResolutionChoice).toBeNull();
    expect(game.stack.objects).toHaveLength(0);

    gameEventManager.addEvents([
        new GameEvent_DealDamage(chosen, opponent, 3),
        new GameEvent_DealDamage(other, caster, 1),
        new GameEvent_DealDamage(chosen, caster, 4),
    ]);
    expect(opponent.life).toBe(17);
    expect(caster.life).toBe(18);
    gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 4));
    expect(caster.life).toBe(14);
});

describe("Consecrate Land", () => {
    const consecrateLand = cardData.find(card => card.name === "Consecrate Land");
    const plains = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;
    let land: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
    });

    test("enchants an opponent's land for one white mana and protects it from Armageddon", () => {
        startMainPhase();
        const manaSource = addTestCard(plains, caster, caster.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const aura = addTestCard(consecrateLand, caster, caster.hand);
        const [cast] = playerActionManager.getCardActions(aura, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([creature])).toBe(false);
        game.pendingTargeter.onTargeted([land]);
        passPriorityRound();

        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(manaSource.tapped).toBe(true);
        expect(attached?.attachedTo).toBe(land);
        expect(land.hasKeyword(Keyword.Indestructible)).toBe(true);

        const armageddon = addTestCard(cardData.find(card => card.name === "Armageddon"), caster, caster.hand);
        expect(game.stack.spellCast(caster, armageddon)).toBe(true);
        game.stack.resolveAll();

        expect(caster.graveyard.objects.map(object => object.card)).toContain(manaSource.card);
        expect(land.zone).toBe(opponent.battlefield);
        expect(attached.attachedTo).toBe(land);

        gameEventManager.addEvent(new GameEvent_SacrificePermanent(opponent, land));
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([land.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
    });

    test("makes other Auras illegal until it leaves the battlefield", () => {
        const otherAura = { ...consecrateLand, name: "Test land Aura", abilities: [{ parts: {
            SimpleAura: { targetValidator: { cardType: CardType.Land } },
        } }] };
        const firstAura = addTestCard(otherAura, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, firstAura, [land])).toBe(true);
        game.stack.resolveAll();

        const aura = addTestCard(consecrateLand, caster, caster.hand);
        expect(game.stack.spellCast(caster, aura, [land])).toBe(true);
        game.stack.resolveAll();

        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(attached?.attachedTo).toBe(land);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([firstAura.card]);
        const nextAura = addTestCard(otherAura, opponent, opponent.hand);
        const secondConsecrate = addTestCard(consecrateLand, caster, caster.hand);
        expect(game.stack.spellCast(caster, secondConsecrate, [land])).toBe(false);
        expect(game.stack.spellCast(opponent, nextAura, [land])).toBe(false);

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(nextAura, opponent.battlefield, { attachedTo: land }));
        expect(nextAura.zone).toBe(opponent.hand);

        moveTestCard(attached, caster.graveyard);
        expect(land.hasKeyword(Keyword.Indestructible)).toBe(false);
        expect(game.stack.spellCast(opponent, nextAura, [land])).toBe(true);
        game.stack.resolveAll();
        expect(opponent.battlefield.objects.find(object => object.card === nextAura.card)?.attachedTo).toBe(land);
    });
});

describe("Ancestral Recall", () => {
    let caster: Player;
    let opponent: Player;
    let island: Permanent;
    let recall: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        island = addTestCard(cardData.find(card => card.name === "Island"), caster, caster.battlefield);
        recall = addTestCard(cardData[ANCESTRAL_RECALL], caster, caster.hand);
    });

    function beginCasting() {
        const [action] = playerActionManager.getCardActions(recall, caster);
        action.perform(caster);
        expect(game.pendingTargeter?.source).toBe(recall);
        return game.pendingTargeter;
    }

    test.each(["caster", "opponent"])("only the chosen %s draws three cards", recipient => {
        const target = recipient === "caster" ? caster : opponent;
        const resolveSpell = vi.spyOn(game.stack, "resolveSpell");
        const request = beginCasting();

        expect(island.tapped).toBe(false);
        expect(recall.zone).toBe(caster.hand);
        expect(game.stack.objects).toHaveLength(0);
        expect(resolveSpell).not.toHaveBeenCalled();

        request.onTargeted([target]);
        request.onTargeted([target]);
        passPriorityRound();

        expect(resolveSpell).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ card: recall.card, targets: [target] }));
        expect(game.pendingTargeter).toBeNull();
        expect(island.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
        expect(caster.hand.objects).toHaveLength(target === caster ? 10 : 7);
        expect(opponent.hand.objects).toHaveLength(target === opponent ? 10 : 7);
    });

    test("each draw uses the top of the library after the previous draw's follow-ups", () => {
        const next = addTestCard(cardData[FOREST], opponent, opponent.library);
        const first = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.library);
        const inserted = addTestCard(cardData[FOREST], opponent, opponent.hand);
        const drawn: CardObject["card"][] = [];
        const afterDraw = (event: GameEvent_ChangeCardZone) => {
            if (event.oldZone !== opponent.library || event.newZone !== opponent.hand)
                return;

            drawn.push(event.oldObject.card);
            if (event.oldObject === first) {
                gameEventManager.onResolved(() => {
                    gameEventManager.addEvent(new GameEvent_ChangeCardZone(inserted, opponent.library));
                });
            }
        };
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, afterDraw);
        try {
            beginCasting().onTargeted([opponent]);
            passPriorityRound();
        } finally {
            gameEventManager.offPerformed(GameEventType.ChangeCardZone, afterDraw);
        }

        expect(drawn).toEqual([first.card, inserted.card, next.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
    });

    test("rejects a missing target, a card, and a player outside the game", () => {
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, recall));
        expect(recall.zone).toBe(caster.hand);

        const request = beginCasting();
        request.onTargeted([]);
        request.onTargeted([island]);
        request.onTargeted([new Player(2, [])]);

        expect(game.pendingTargeter).toBe(request);
        expect(island.tapped).toBe(false);
        expect(recall.zone).toBe(caster.hand);
        request.onTargeted([opponent]);
        passPriorityRound();
        expect(opponent.hand.objects).toHaveLength(10);
    });

    test("cancelling preserves the spell and mana and allows another attempt", () => {
        caster.manaPool[ManaColour.U] = 1;
        const request = beginCasting();

        request.onCancelled();
        request.onTargeted([opponent]);

        expect(game.pendingTargeter).toBeNull();
        expect(recall.zone).toBe(caster.hand);
        expect(island.tapped).toBe(false);
        expect(caster.manaPool[ManaColour.U]).toBe(1);
        expect(opponent.hand.objects).toHaveLength(7);

        beginCasting().onTargeted([opponent]);
        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(opponent.hand.objects).toHaveLength(10);
    });
});

describe("Animate Wall", () => {
    let caster: Player;
    let opponent: Player;
    let aura: CardObject;
    let plains: Permanent;

    function cardByName<T extends CardObject>(name: string, owner: Player, zone: Zone<T>) {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        plains = cardByName("Plains", caster, caster.battlefield);
        aura = cardByName("Animate Wall", caster, caster.hand);
    });

    function beginCasting() {
        const [action] = playerActionManager.getCardActions(aura, caster);
        action.perform(caster);
        expect(game.pendingTargeter?.source).toBe(aura);
        return game.pendingTargeter;
    }

    test.each(["caster", "opponent"])("lets the %s's enchanted Wall attack with defender", recipient => {
        const controller = recipient === "caster" ? caster : opponent;
        const wall = cardByName("Wall of Swords", controller, controller.battlefield);
        const otherWall = cardByName("Wall of Swords", controller, controller.battlefield);
        const declaration = new GameEvent_DeclareAttacker(wall);
        expect(gameEventManager.checkEvent(declaration)).toBe(false);

        const request = beginCasting();
        expect(plains.tapped).toBe(false);
        request.onTargeted([wall]);
        passPriorityRound();
        expect(plains.tapped).toBe(true);
        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(attached?.attachedTo).toBe(wall);
        expect(wall.hasKeyword(Keyword.Defender)).toBe(true);

        if (controller === opponent)
            gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        expect(CombatManager.canAttack(otherWall)).toBe(false);
        expect(wall.tapped).toBe(false);
        const [attack] = playerActionManager.getCardActions(wall, controller);
        attack.perform(controller);
        expect(CombatManager.attackingCreatures.has(wall)).toBe(true);

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(attached, caster.graveyard));
        expect(CombatManager.canAttack(wall)).toBe(false);
    });

    test("requires a Wall on the battlefield before offering or completing the cast", () => {
        const wall = cardByName("Wall of Swords", opponent, opponent.hand);
        const otherCreature = cardByName("Grizzly Bears", opponent, opponent.battlefield);
        expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, aura));
        expect(aura.zone).toBe(caster.hand);

        const legalWall = cardByName("Wall of Swords", caster, caster.battlefield);
        const request = beginCasting();
        request.onTargeted([otherCreature]);
        request.onTargeted([plains]);
        request.onTargeted([wall]);
        request.onTargeted([opponent]);

        expect(game.pendingTargeter).toBe(request);
        expect(plains.tapped).toBe(false);
        expect(aura.zone).toBe(caster.hand);
        request.onTargeted([legalWall]);
        passPriorityRound();
        expect(caster.battlefield.objects.find(object => object.card === aura.card)?.attachedTo).toBe(legalWall);
    });
});

describe.each([
    { name: "Black Ward", colour: "B", otherColour: "U" },
    { name: "Blue Ward", colour: "U", otherColour: "B" },
    { name: "Green Ward", colour: "G", otherColour: "R" },
    { name: "Red Ward", colour: "R", otherColour: "G" },
    { name: "White Ward", colour: "W", otherColour: "B" },
] as const)("$name", ({ name, colour, otherColour }) => {
    const wardDef = cardData.find(card => card.name === name);
    const protection = { parts: { AbilityPart_Protection: { colour } } };
    let caster: Player;
    let opponent: Player;
    let ward: CardObject;
    let plains: Permanent;
    let creature: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        ward = addTestCard(wardDef, caster, caster.hand);
        plains = addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield);
        creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    });

    function castWard(): Permanent {
        expect(game.stack.spellCast(caster, ward, [creature])).toBe(true);
        game.stack.resolveAll();
        return caster.battlefield.objects.find(object => object.card === ward.card);
    }

    test("pays white mana to enchant a creature and grants protection while attached", () => {
        const [action] = playerActionManager.getCardActions(ward, caster);
        action.perform(caster);
        const request = game.pendingTargeter;
        expect(request?.source).toBe(ward);
        request.onTargeted([plains]);
        expect(game.pendingTargeter).toBe(request);
        expect(plains.tapped).toBe(false);

        request.onTargeted([creature]);
        passPriorityRound();
        expect(game.pendingTargeter).toBeNull();
        expect(plains.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        const attachedWard = caster.battlefield.objects.find(object => object.card === ward.card);
        expect(attachedWard?.attachedTo).toBe(creature);
        expect(creature.abilities).toEqual([expect.objectContaining({ source: creature, grantedBy: attachedWard })]);

        const source = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: `{${colour}}` }, opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(0);

        const otherSource = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: `{${otherColour}}` }, opponent, opponent.battlefield);
        expect(gameEventManager.checkEvent(new GameEvent_DealDamage(otherSource, creature, 1))).toBe(true);

        moveTestCard(attachedWard, caster.graveyard);
        expect(creature.abilities).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(1);
    });

    test("the grant follows reattachment and ends on detach or loss of the granting ability", () => {
        const attachedWard = castWard();
        const otherCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const [initialGrant] = creature.abilities;
        attachedWard.colours = new Set(["W", colour]);

        const { revoke } = otherCreature.grantAbility(protection, plains);
        gameEventManager.addEvent(new GameEvent_AttachPermanent(attachedWard, otherCreature));
        expect(attachedWard.attachedTo).toBe(creature);
        expect(creature.abilities[0]).toBe(initialGrant);
        revoke();

        gameEventManager.addEvent(new GameEvent_AttachPermanent(attachedWard, otherCreature));
        expect(attachedWard.attachedTo).toBe(otherCreature);
        expect(creature.abilities).toHaveLength(0);
        expect(otherCreature.abilities).toEqual([expect.objectContaining({ source: otherCreature, grantedBy: attachedWard })]);
        expect(otherCreature.abilities).not.toContain(initialGrant);
        expect(attachedWard.zone).toBe(caster.battlefield);

        attachedWard.attachedTo = undefined;
        expect(otherCreature.abilities).toHaveLength(0);
        attachedWard.attachedTo = otherCreature;
        expect(otherCreature.abilities).toHaveLength(1);

        attachedWard.abilities = attachedWard.abilities.slice(0, 1);
        expect(attachedWard.attachedTo).toBe(otherCreature);
        expect(otherCreature.abilities).toHaveLength(0);
    });

    test("its own protection keeps it attached until an independent grant applies", () => {
        const firstWard = castWard();
        firstWard.colours = new Set(["W", colour]);
        game.checkState();
        expect(firstWard.attachedTo).toBe(creature);
        expect(firstWard.zone).toBe(caster.battlefield);

        const secondWard = addTestCard(wardDef, caster, caster.hand);
        expect(secondWard.spellTargeter.validateTargets([creature])).toBe(colour !== "W");

        const { ability: independentGrant } = creature.grantAbility(protection, plains);
        game.checkState();
        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: firstWard.card }));
        expect(creature.abilities).toEqual([independentGrant]);
    });

    test("a separate protection grant from the same Aura can remove it", () => {
        // 702.16n: Start colourless so both grants can apply before the Aura gains the protected colour.
        ward = addTestCard({
            ...wardDef,
            cost: "{1}",
            abilities: [...wardDef.abilities, { parts: {
                AbilityPart_SelectObjectContinuously: { target: "THIS.attachedTo", saveAs: "ENCHANTED_CREATURE" },
                AbilityPart_GrantAbilityContinuously: { permanentsFrom: "ENCHANTED_CREATURE", grant: protection },
            } }],
        }, caster, caster.hand);
        const attachedWard = castWard();
        expect(creature.abilities).toHaveLength(2);

        attachedWard.colours = new Set([colour]);
        game.checkState();

        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: ward.card }));
        expect(creature.abilities).toHaveLength(0);
    });
});

describe("Castle", () => {
    const castleDef = cardData.find(card => card.name === "Castle");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        creature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
    });

    test("gives only its controller's untapped creatures +0/+2 after it resolves", () => {
        const castle = addTestCard(castleDef, caster, caster.hand);
        const plains = addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield);
        const forests = Array.from({ length: 3 }, () => addTestCard(cardData[FOREST], caster, caster.battlefield));
        const opposingCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const tappedCreature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_TapCard(tappedCreature));

        const [cast] = playerActionManager.getCardActions(castle, caster);
        cast.perform(caster);
        expect(creature.toughness).toBe(2);
        passPriorityRound();

        expect([plains, ...forests].every(land => land.tapped)).toBe(true);
        expect(creature.power).toBe(2);
        expect(creature.toughness).toBe(4);
        expect(opposingCreature.toughness).toBe(2);
        expect(tappedCreature.toughness).toBe(2);
        expect(game.pendingTargeter).toBeNull();
    });

    test("applies as creatures enter and updates when they tap and untap", () => {
        const castle = addTestCard(castleDef, caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_TapCard(castle));

        const card = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
        const entry = new GameEvent_ChangeCardZone(card, caster.battlefield, { controller: caster });
        gameEventManager.addEvent(entry);
        const newCreature = caster.battlefield.objects.find(object => object === entry.newObject);
        expect(newCreature.toughness).toBe(4);

        gameEventManager.addEvent(new GameEvent_TapCard(newCreature));
        expect(newCreature.toughness).toBe(2);
        gameEventManager.addEvent(new GameEvent_UntapCard(newCreature));
        expect(newCreature.toughness).toBe(4);
    });

    test("each Castle contributes its bonus and losing it can make existing damage lethal", () => {
        const first = addTestCard(castleDef, caster, caster.battlefield);
        const second = addTestCard(castleDef, caster, caster.battlefield);
        expect(creature.toughness).toBe(6);

        const attacker = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, creature, 3));
        moveTestCard(first, caster.graveyard);
        expect(creature.toughness).toBe(4);

        moveTestCard(second, caster.graveyard);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(creature.card);
    });
});

describe("Crusade", () => {
    const def = cardData.find(card => card.name === "Crusade");
    const heroDef = cardData.find(card => card.name === "Benalish Hero");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    test("casts for {W}{W} and gives both players' white creatures +1/+1 on the battlefield", () => {
        const crusade = addTestCard(def, caster, caster.hand);
        const hero = addTestCard(heroDef, caster, caster.battlefield);
        const opposingHero = addTestCard(heroDef, opponent, opponent.battlefield);
        const bears = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const heroInHand = addTestCard(heroDef, opponent, opponent.hand);
        gameEventManager.addEvent(new GameEvent_TapCard(opposingHero));
        const plainsDef = cardData.find(card => card.name === "Plains");
        const firstPlains = addTestCard(plainsDef, caster, caster.battlefield);
        const forest = addTestCard(cardData[FOREST], caster, caster.battlefield);
        expect(playerActionManager.getCardActions(crusade, caster)).toHaveLength(0);

        const secondPlains = addTestCard(plainsDef, caster, caster.battlefield);
        const [cast] = playerActionManager.getCardActions(crusade, caster);
        cast.perform(caster);
        expect([firstPlains.tapped, secondPlains.tapped, forest.tapped]).toEqual([true, true, false]);
        expect([hero.power, hero.toughness]).toEqual([1, 1]);
        passPriorityRound();

        expect([hero.power, hero.toughness]).toEqual([2, 2]);
        expect([opposingHero.power, opposingHero.toughness]).toEqual([2, 2]);
        expect([bears.power, bears.toughness]).toEqual([2, 2]);
        expect([heroInHand.power, heroInHand.toughness]).toEqual([1, 1]);
    });

    test("bonuses stack for a multicoloured creature entering later and end as each Crusade leaves", () => {
        const first = addTestCard(def, caster, caster.battlefield);
        const second = addTestCard(def, opponent, opponent.battlefield);
        const hero = addTestCard({ ...heroDef, cost: "{W}{G}" }, opponent, opponent.battlefield);
        expect([hero.power, hero.toughness]).toEqual([3, 3]);

        moveTestCard(first, caster.graveyard);
        expect([hero.power, hero.toughness]).toEqual([2, 2]);
        moveTestCard(second, opponent.graveyard);
        expect([hero.power, hero.toughness]).toEqual([1, 1]);
    });
});

describe("Armageddon", () => {
    let caster: Player;
    let opponent: Player;
    let armageddon: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        armageddon = addTestCard(cardData.find(card => card.name === "Armageddon"), caster, caster.hand);
    });

    test("destroys every land on the battlefield simultaneously", () => {
        const forest = cardData[FOREST];
        const casterLands = [
            addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield),
            ...Array.from({ length: 3 }, () => addTestCard(forest, caster, caster.battlefield)),
        ];
        const nonbasic = addTestCard({ ...forest, name: "Nonbasic land", subtypes: [], abilities: [] },
            opponent, opponent.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const landInHand = addTestCard(forest, opponent, opponent.hand);
        const landInLibrary = addTestCard(forest, opponent, opponent.library);

        const onDestroy = vi.fn(() => {
            expect(caster.battlefield.objects).toEqual([creature]);
            expect(opponent.battlefield.objects).toHaveLength(0);
            expect(new Set(caster.graveyard.objects.map(object => object.card))).toEqual(new Set(casterLands.map(land => land.card)));
            expect(opponent.graveyard.objects.map(object => object.card)).toEqual([nonbasic.card]);
            expect(game.stack.objects[0]).toMatchObject({ card: armageddon.card, targets: [] });
        });
        gameEventManager.onPerformed(GameEventType.DestroyPermanent, onDestroy);
        try {
            const [action] = playerActionManager.getCardActions(armageddon, caster);
            action.perform(caster);
            passPriorityRound();

            expect(onDestroy).toHaveBeenCalledTimes(casterLands.length + 1);
            expect(game.pendingTargeter).toBeNull();
            expect(game.stack.objects).toHaveLength(0);
            expect(caster.graveyard.objects.at(-1)?.card).toBe(armageddon.card);
            expect(caster.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
            expect(landInHand.zone).toBe(opponent.hand);
            expect(landInLibrary.zone).toBe(opponent.library);
        } finally {
            gameEventManager.offPerformed(GameEventType.DestroyPermanent, onDestroy);
        }
    });

    test("can be cast and resolved with no lands on the battlefield", () => {
        caster.manaPool[ManaColour.W] = 4;
        const [action] = playerActionManager.getCardActions(armageddon, caster);
        action.perform(caster);
        passPriorityRound();

        expect(game.pendingTargeter).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([armageddon.card]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
    });
});

describe("Balance", () => {
    let caster: Player;
    let opponent: Player;
    let balance: CardObject;

    function addCard<T extends CardObject>(name: string, owner: Player, zone: Zone<T>): T {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    function cast() {
        const [action] = playerActionManager.getCardActions(balance, caster);
        expect(action).toBeDefined();
        action.perform(caster);
        passPriorityRound();
    }

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        balance = addCard("Balance", caster, caster.hand);
    });

    test("pays {1}{W}, then chooses lands, discards cards, and chooses creatures", () => {
        const plains = addCard("Plains", caster, caster.battlefield);
        const forest = addCard("Forest", caster, caster.battlefield);
        const mountain = addCard("Mountain", opponent, opponent.battlefield);
        const keepInHand = addCard("Plains", caster, caster.hand);
        const discard = [addCard("Air Elemental", caster, caster.hand), addCard("Forest", caster, caster.hand)];
        const opponentHand = addCard("Forest", opponent, opponent.hand);
        const bears = addCard("Grizzly Bears", caster, caster.battlefield);
        const wall = addCard("Wall of Swords", opponent, opponent.battlefield);
        const goblins = addCard("Mons's Goblin Raiders", opponent, opponent.battlefield);
        const cardInLibrary = addCard("Forest", opponent, opponent.library);

        cast();

        const spell = game.stack.objects[0];
        expect(spell).toMatchObject({ card: balance.card, targets: [] });
        expect(game.pendingTargeter).toBeNull();
        expect([plains.tapped, forest.tapped]).toEqual([true, true]);
        expect(caster.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 1, options: [plains, forest] });
        game.pendingResolutionChoice.submit(caster, [plains]);

        expect(game.stack.objects).toEqual([spell]);
        expect(caster.battlefield.objects).toEqual([plains, bears]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 2, visibility: CardChoiceVisibility.Private });
        game.pendingResolutionChoice.submit(caster, discard);

        expect(game.stack.objects).toEqual([spell]);
        expect(caster.hand.objects).toEqual([keepInHand]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: opponent, count: 1, options: [wall, goblins] });
        game.pendingResolutionChoice.submit(opponent, [wall]);

        expect(game.pendingResolutionChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(card => card.card)).toEqual([forest.card, ...discard.map(card => card.card), balance.card]);
        expect(opponent.graveyard.objects.map(card => card.card)).toEqual([goblins.card]);
        expect(opponent.battlefield.objects).toEqual([mountain, wall]);
        expect(opponent.hand.objects).toEqual([opponentHand]);
        expect(opponent.library.objects).toEqual([cardInLibrary]);
    });

    test("counts later phases after earlier batches and their follow-ups", () => {
        caster.manaPool[ManaColour.W] = 2;
        const land = addCard("Forest", caster, caster.battlefield);
        const extraHandCard = addCard("Forest", caster, caster.library);
        const kept = addCard("Plains", caster, caster.hand);
        addCard("Plains", opponent, opponent.hand);
        const bears = addCard("Grizzly Bears", caster, caster.battlefield);
        const opponentBears = addCard("Grizzly Bears", opponent, opponent.battlefield);
        const afterLand = (event: GameEvent_ChangeCardZone) => {
            if (event.oldObject !== land)
                return;

            const followUp = new GameEvent_Log(GameEventType.Log, "Move a card to hand after the land sacrifice");
            followUp.then(() => gameEventManager.onResolved(() => {
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(extraHandCard, caster.hand));
            }));
            gameEventManager.addEvent(followUp);
        };
        const afterDiscard = () => gameEventManager.addEvent(new GameEvent_ChangeCardZone(opponentBears, opponent.graveyard));
        gameEventManager.onPerformed(GameEventType.SacrificePermanent, afterLand);
        gameEventManager.onPerformed(GameEventType.DiscardCard, afterDiscard);
        try {
            cast();
            expect(land.retired).toBe(true);
            const drawn = caster.hand.objects.find(card => card.card === extraHandCard.card);
            expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 1, options: [kept, drawn] });
            game.pendingResolutionChoice.submit(caster, [drawn]);

            expect(game.pendingResolutionChoice).toBeNull();
            expect(opponent.battlefield.objects).toHaveLength(0);
            expect(caster.battlefield.objects).toHaveLength(0);
            expect(caster.graveyard.objects.map(card => card.card)).toEqual([land.card, drawn.card, bears.card, balance.card]);
        } finally {
            gameEventManager.offPerformed(GameEventType.SacrificePermanent, afterLand);
            gameEventManager.offPerformed(GameEventType.DiscardCard, afterDiscard);
        }
    });

    test("skips prompts for tied and forced selections", () => {
        caster.manaPool[ManaColour.W] = 2;
        const land = addCard("Plains", caster, caster.battlefield);
        const opponentLand = addCard("Forest", opponent, opponent.battlefield);
        const opponentCard = addCard("Wall of Swords", opponent, opponent.hand);
        const opponentCreature = addCard("Grizzly Bears", opponent, opponent.battlefield);
        const onChoice = vi.fn();
        gameEventManager.onPerformed(GameEventType.RequestResolutionChoice, onChoice);
        try {
            cast();
            expect(onChoice).not.toHaveBeenCalled();
            expect(caster.battlefield.objects).toEqual([land]);
            expect(opponent.battlefield.objects).toEqual([opponentLand]);
            expect(opponent.hand.objects).toHaveLength(0);
            expect(opponent.graveyard.objects.map(card => card.card)).toEqual([opponentCard.card, opponentCreature.card]);
            expect(caster.graveyard.objects.map(card => card.card)).toEqual([balance.card]);
        } finally {
            gameEventManager.offPerformed(GameEventType.RequestResolutionChoice, onChoice);
        }
    });
});

describe("Blaze of Glory", () => {
    let attacker: Player;
    let defender: Player;

    function addCard<T extends CardObject>(name: string, owner: Player, zone: Zone<T>) {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    function declareAttackers(creatures: readonly Permanent[]) {
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        for (const creature of creatures)
            new PlayerActions.DeclareAttacker(creature).perform(attacker);
        gameEventManager.addEvent(new GameEvent_Advance());
    }

    beforeEach(() => {
        Game.init();
        attacker = game.addPlayer([]);
        defender = game.addPlayer([]);
        startMainPhase();
    });

    test("the defender can cast after attackers are declared and must block each legal attacker", () => {
        const blaze = addCard("Blaze of Glory", defender, defender.hand);
        const plains = addCard("Plains", defender, defender.battlefield);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        blocker.toughness = 6;
        const bystander = addCard("Grizzly Bears", defender, defender.battlefield);
        const first = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const second = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const flyer = addCard("Air Elemental", attacker, attacker.battlefield);
        declareAttackers([first, second, flyer]);

        expect(game.currentStepIndex).toBe(StepIndex.DeclareAttackers);
        expect([first.tapped, second.tapped, flyer.tapped]).toEqual([true, true, true]);
        gameEventManager.addEvent(new GameEvent_Advance(attacker));
        expect(game.priorityPlayer).toBe(defender);
        new PlayerActions.PlayCard(blaze).perform(defender);
        game.pendingTargeter.onTargeted([blocker]);
        expect(plains.tapped).toBe(true);
        expect(game.stack.objects).toMatchObject([{ card: blaze.card, targets: [blocker] }]);
        expect(CombatManager.blockLimit(blocker)).toBe(1);
        passPriorityRound();
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);
        expect(CombatManager.blockLimit(bystander)).toBe(1);
        passPriorityRound();

        expect(game.declarationPlayer).toBe(defender);
        const block = new PlayerActions.DeclareBlocker(blocker);
        block.perform(defender, [first]);
        block.perform(defender, [flyer]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.declarationPlayer).toBe(defender);
        expect(CombatManager.blockingCreatures.get(blocker)).toEqual(new Set([first]));

        block.perform(defender, [second]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.priorityPlayer).toBe(attacker);
        expect([...CombatManager.blockRelationships()]).toEqual([[blocker, first], [blocker, second]]);
        passPriorityRound();
        expect(game.pendingCombatDamageChoice).toMatchObject({ player: defender, source: blocker, recipients: [first, second], total: 2 });
        game.pendingCombatDamageChoice.submit(defender, [1, 1]);
        expect(blocker.damageTaken).toBe(2);
        expect(attacker.graveyard.objects.map(object => object.card)).toEqual([first.card, second.card]);

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(CombatManager.blockLimit(blocker)).toBe(1);
        expect(blocker.abilities).toHaveLength(0);
    });

    test("can target a tapped defending creature before attacks but only during the casting window", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const lateBlaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const first = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        const land = addCard("Plains", defender, defender.battlefield);
        blocker.tapped = true;
        game.infiniteMana = true;
        expect(playerActionManager.getCardActions(blaze, attacker)).toEqual([]);
        gameEventManager.addEvent(new GameEvent_CastSpell(attacker, blaze, [blocker]));
        expect(blaze.zone).toBe(attacker.hand);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.BeginningOfCombat));

        new PlayerActions.PlayCard(blaze).perform(attacker);
        const request = game.pendingTargeter;
        request.onTargeted([first]);
        request.onTargeted([land]);
        expect(game.pendingTargeter).toBe(request);
        request.onTargeted([blocker]);
        passPriorityRound();
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);

        declareAttackers([first]);
        passPriorityRound();
        expect(CombatManager.potentialBlockTargetsFor(blocker)).toEqual([]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.priorityPlayer).toBe(attacker);
        expect(game.currentStepIndex).toBe(StepIndex.DeclareBlockers);
        expect(playerActionManager.getCardActions(lateBlaze, attacker)).toEqual([]);
    });

    test("loses its target if the creature leaves and returns before resolution", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.BeginningOfCombat));
        gameEventManager.addEvent(new GameEvent_CastSpell(attacker, blaze, [blocker]));
        const returned = moveTestCard(moveTestCard(blocker, defender.graveyard), defender.battlefield);

        passPriorityRound();
        expect(CombatManager.blockLimit(returned)).toBe(1);
        expect(returned.abilities).toHaveLength(0);
        expect(attacker.graveyard.objects.map(object => object.card)).toEqual([blaze.card]);
    });
});

describe("Blessing", () => {
    const blessingDef = cardData.find(card => card.name === "Blessing");
    const plainsDef = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;
    let blessing: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        blessing = addTestCard(blessingDef, caster, caster.hand);
    });

    function castBlessing() {
        const [action] = playerActionManager.getCardActions(blessing, caster);
        action.perform(caster);
        game.pendingTargeter.onTargeted([creature]);
        passPriorityRound();
        const aura = caster.battlefield.objects.find(object => object.card === blessing.card);
        expect(aura?.attachedTo).toBe(creature);
        return aura;
    }

    function activate(aura: Permanent) {
        const [action] = playerActionManager.getCardActions(aura, caster);
        expect(action).toBeInstanceOf(PlayerActions.ActivateAbility);
        action.perform(caster);
    }

    test("casts for two white mana and stacks repeatable pumps paid by the Aura's controller", () => {
        const firstPlains = addTestCard(plainsDef, caster, caster.battlefield);
        expect(playerActionManager.getCardActions(blessing, caster)).toHaveLength(0);
        const secondPlains = addTestCard(plainsDef, caster, caster.battlefield);
        const aura = castBlessing();
        expect([firstPlains.tapped, secondPlains.tapped]).toEqual([true, true]);
        expect(creature).toMatchObject({ power: 2, toughness: 2 });
        expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);

        caster.manaPool[ManaColour.W] = 1;
        const thirdPlains = addTestCard(plainsDef, caster, caster.battlefield);
        activate(aura);
        expect(thirdPlains.tapped).toBe(false);
        activate(aura);
        expect(thirdPlains.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(game.stack.objects).toHaveLength(2);
        expect(game.pendingTargeter).toBeNull();
        expect(creature).toMatchObject({ power: 2, toughness: 2 });

        gameEventManager.addEvent(new GameEvent_Advance());
        opponent.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(aura, opponent)).toHaveLength(0);
        expect(playerActionManager.getCardActions(creature, opponent)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_Advance());
        expect(creature).toMatchObject({ power: 3, toughness: 3 });
        passPriorityRound();
        expect(creature).toMatchObject({ power: 4, toughness: 4 });

        gameEventManager.addEvent(new GameEvent_DealDamage(creature, creature, 3));
        expect(creature).toMatchObject({ damageTaken: 3, zone: opponent.battlefield });
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(creature).toMatchObject({ power: 2, toughness: 2, damageTaken: 0, zone: opponent.battlefield });
    });

    test("each resolution pumps the creature attached at that time", () => {
        caster.manaPool[ManaColour.W] = 4;
        const aura = castBlessing();
        const other = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);

        activate(aura);
        passPriorityRound();
        activate(aura);
        gameEventManager.addEvent(new GameEvent_AttachPermanent(aura, other));
        passPriorityRound();

        expect(aura.attachedTo).toBe(other);
        expect(creature).toMatchObject({ power: 3, toughness: 3 });
        expect(other).toMatchObject({ power: 3, toughness: 3 });
    });

    test("an activation still pumps the last enchanted creature if Blessing leaves first", () => {
        caster.manaPool[ManaColour.W] = 3;
        const aura = castBlessing();
        activate(aura);
        moveTestCard(aura, caster.graveyard);
        passPriorityRound();

        expect(creature).toMatchObject({ power: 3, toughness: 3 });
    });

    test("a pending activation does not pump a creature that left and returned", () => {
        caster.manaPool[ManaColour.W] = 3;
        const aura = castBlessing();
        activate(aura);
        const returned = moveTestCard(moveTestCard(creature, opponent.hand), opponent.battlefield);
        passPriorityRound();

        expect(returned).toMatchObject({ power: 2, toughness: 2 });
        expect(aura.retired).toBe(true);
    });
});

describe.each([
    { name: "Holy Armor", power: 2 },
    { name: "Holy Strength", power: 3 },
])("$name", ({ name, power }) => {
    test("enchants a creature for {W} and applies its static bonus to the current attachment", () => {
        Game.init();
        const caster = game.addPlayer(BASIC_DECK);
        const opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        const card = addTestCard(cardData.find(def => def.name === name), caster, caster.hand);
        const land = addTestCard(cardData[FOREST], caster, caster.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const other = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);

        caster.manaPool[ManaColour.W] = 1;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([land])).toBe(false);
        game.pendingTargeter.onTargeted([creature]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(creature).toMatchObject({ power: 2, toughness: 2 });

        passPriorityRound();
        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura?.attachedTo).toBe(creature);
        expect(creature).toMatchObject({ power, toughness: 4 });
        expect(other).toMatchObject({ power: 2, toughness: 2 });

        // 303.4m and 611.3a: The static effect follows the Aura's current attachment.
        gameEventManager.addEvent(new GameEvent_AttachPermanent(aura, other));
        expect(creature).toMatchObject({ power: 2, toughness: 2 });
        expect(other).toMatchObject({ power, toughness: 4 });

        moveTestCard(aura, caster.graveyard);
        expect(other).toMatchObject({ power: 2, toughness: 2 });
    });
});

test("Holy Armor's controller can pay {W} repeatedly for extra toughness until cleanup", () => {
    Game.init();
    const caster = game.addPlayer(BASIC_DECK);
    const opponent = game.addPlayer(BASIC_DECK);
    startMainPhase();
    const card = addTestCard(cardData.find(def => def.name === "Holy Armor"), caster, caster.hand);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    expect(game.stack.spellCast(caster, card, [creature])).toBe(true);
    passPriorityRound();
    const aura = caster.battlefield.objects.find(object => object.card === card.card);
    expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);

    caster.manaPool[ManaColour.W] = 2;
    for (let payment = 0; payment < 2; payment++) {
        const [activate] = playerActionManager.getCardActions(aura, caster);
        expect(activate).toBeInstanceOf(PlayerActions.ActivateAbility);
        activate.perform(caster);
    }
    expect(caster.manaPool[ManaColour.W]).toBe(0);
    expect(game.pendingTargeter).toBeNull();
    expect(game.stack.objects).toHaveLength(2);
    expect(creature).toMatchObject({ power: 2, toughness: 4 });

    gameEventManager.addEvent(new GameEvent_Advance());
    // 303.4e: The Aura's controller activates its abilities.
    opponent.manaPool[ManaColour.W] = 1;
    expect(playerActionManager.getCardActions(aura, opponent)).toHaveLength(0);
    gameEventManager.addEvent(new GameEvent_Advance());
    expect(creature).toMatchObject({ power: 2, toughness: 5 });
    passPriorityRound();
    expect(creature).toMatchObject({ power: 2, toughness: 6 });

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
    expect(creature).toMatchObject({ power: 2, toughness: 4 });
});

describe("Island Sanctuary", () => {
    const def = cardData.find(card => card.name === "Island Sanctuary");
    const bears = cardData[GRIZZLY_BEARS];
    let controller: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        opponent = game.addPlayer(BASIC_DECK);
        controller = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    function startDrawStep() {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Draw));
        expect(game.currentTurnPlayer()).toBe(controller);
        expect(game.currentStepIndex).toBe(StepIndex.Draw);
    }

    test("casts for {1}{W} and only offers to skip its controller's draws during their draw step", () => {
        const card = addTestCard(def, controller, controller.hand);
        startDrawStep();
        expect(game.pendingOptionalChoice).toBeNull();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        controller.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(card, controller)).toHaveLength(0);
        controller.manaPool[ManaColour.G] = 1;
        const [cast] = playerActionManager.getCardActions(card, controller);
        cast.perform(controller);
        passPriorityRound();
        expect(controller.battlefield.objects.some(permanent => permanent.card === card.card)).toBe(true);

        const extra = controller.library.getTopCard().card;
        gameEventManager.addEvent(new GameEvent_DrawCard(controller));
        expect(game.pendingOptionalChoice).toBeNull();
        expect(controller.hand.objects.at(-1).card).toBe(extra);

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Draw));
        expect(game.pendingOptionalChoice).toBeNull();
        startDrawStep();
        expect(game.pendingOptionalChoice?.player).toBe(controller);
        game.pendingOptionalChoice.submit(controller, OptionalDecision.Decline);
        const ground = addTestCard(bears, opponent, opponent.battlefield);
        expect(gameEventManager.checkEvent(new GameEvent_DeclareAttacker(ground, controller))).toBe(true);

        const opposingDraw = opponent.library.getTopCard().card;
        gameEventManager.addEvent(new GameEvent_DrawCard(opponent));
        expect(game.pendingOptionalChoice).toBeNull();
        expect(opponent.hand.objects.at(-1).card).toBe(opposingDraw);
    });

    test("lets the player decide independently for every draw, including draws from a resolving spell", () => {
        addTestCard(def, controller, controller.battlefield);
        const recall = addTestCard(cardData[ANCESTRAL_RECALL], controller, controller.hand);
        const first = controller.library.getTopCard().card;
        startDrawStep();
        expect(game.priorityPlayer).toBeNull();
        game.pendingOptionalChoice.submit(controller, OptionalDecision.Decline);
        expect(controller.hand.objects.at(-1).card).toBe(first);
        expect(game.priorityPlayer).toBe(controller);

        const next = controller.library.getTopCard().card;
        const before = controller.hand.objects.length - 1;
        expect(game.stack.spellCast(controller, recall, [controller])).toBe(true);
        passPriorityRound();
        const draw = vi.fn();
        gameEventManager.onPerformed(GameEventType.DrawCard, draw);
        try {
            game.pendingOptionalChoice.submit(controller, OptionalDecision.Accept);
            expect(game.stack.isResolving).toBe(true);
            expect(controller.hand.objects).toHaveLength(before);
            expect(controller.library.getTopCard().card).toBe(next);

            game.pendingOptionalChoice.submit(controller, OptionalDecision.Decline);
            expect(controller.hand.objects.at(-1).card).toBe(next);
            game.pendingOptionalChoice.submit(controller, OptionalDecision.Accept);
            expect(controller.hand.objects).toHaveLength(before + 1);
            expect(draw).toHaveBeenCalledTimes(1);
            expect(game.pendingOptionalChoice).toBeNull();
            expect(game.stack.objects).toHaveLength(0);
        } finally {
            gameEventManager.offPerformed(GameEventType.DrawCard, draw);
        }
    });

    test("allows flying and granted islandwalk to attack after the source leaves, until the next turn starts", () => {
        const sanctuary = addTestCard(def, controller, controller.battlefield);
        const ground = addTestCard(bears, opponent, opponent.battlefield);
        const flyer = addTestCard(cardData.find(card => card.name === "Air Elemental"), opponent, opponent.battlefield);
        const merfolk = addTestCard({ ...bears, subtypes: ["Merfolk"] }, opponent, opponent.battlefield);
        const lord = addTestCard(cardData.find(card => card.name === "Lord of Atlantis"), opponent, opponent.battlefield);
        startDrawStep();
        game.pendingOptionalChoice.submit(controller, OptionalDecision.Accept);
        moveTestCard(sanctuary, controller.graveyard);

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        expect(CombatManager.defendingPlayer).toBe(controller);
        expect(playerActionManager.getCardActions(ground, opponent)).toHaveLength(0);
        new PlayerActions.DeclareAttacker(ground).perform(opponent);
        expect(CombatManager.attackingCreatures.has(ground)).toBe(false);
        const [attackWithFlyer] = playerActionManager.getCardActions(flyer, opponent);
        attackWithFlyer.perform(opponent);
        expect(CombatManager.attackingCreatures.get(flyer)).toBe(controller);
        expect(playerActionManager.getCardActions(merfolk, opponent)[0]).toBeInstanceOf(PlayerActions.DeclareAttacker);
        moveTestCard(lord, opponent.graveyard);
        expect(playerActionManager.getCardActions(merfolk, opponent)).toHaveLength(0);

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        expect(game.currentTurnPlayer()).toBe(controller);
        expect(game.currentStepIndex).toBe(StepIndex.Untap);
        expect(gameEventManager.checkEvent(new GameEvent_DeclareAttacker(ground, controller))).toBe(true);
    });

    test("another copy can replace a draw after the first copy is declined, even with an empty library", () => {
        addTestCard(def, controller, controller.battlefield);
        addTestCard(def, controller, controller.battlefield);
        for (const card of [...controller.library.objects])
            moveTestCard(card, controller.graveyard);

        startDrawStep();
        const first = game.pendingOptionalChoice;
        first.submit(controller, OptionalDecision.Decline);
        expect(game.pendingOptionalChoice).toBeTruthy();
        expect(game.pendingOptionalChoice).not.toBe(first);
        game.pendingOptionalChoice.submit(controller, OptionalDecision.Accept);

        expect(game.pendingOptionalChoice).toBeNull();
        expect(controller.library.objects).toHaveLength(0);
        expect(game.priorityPlayer).toBe(controller);
        const ground = addTestCard(bears, opponent, opponent.battlefield);
        expect(gameEventManager.checkEvent(new GameEvent_DeclareAttacker(ground, controller))).toBe(false);
    });
});

describe("Karma", () => {
    const def = cardData.find(card => card.name === "Karma");
    const swamp = cardData.find(card => card.name === BasicLandType.Swamp);
    let controller: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        controller = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
    });

    function startNextUpkeep(player: Player) {
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Upkeep));
        expect(game.currentStepIndex).toBe(StepIndex.Upkeep);
        expect(game.priorityPlayer).toBe(player);
    }

    test("casts for {2}{W}{W} and deals damage to each player on their own upkeep", () => {
        const card = addTestCard(def, controller, controller.hand);
        controller.manaPool[ManaColour.G] = 3;
        controller.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(card, controller)).toHaveLength(0);

        controller.manaPool[ManaColour.G] = 2;
        controller.manaPool[ManaColour.W] = 2;
        const [cast] = playerActionManager.getCardActions(card, controller);
        cast.perform(controller);
        passPriorityRound();
        expect(controller.manaPool[ManaColour.G]).toBe(0);
        expect(controller.manaPool[ManaColour.W]).toBe(0);
        const karma = controller.battlefield.objects.find(permanent => permanent.card === card.card);
        expect(karma).toBeDefined();

        addTestCard(swamp, controller, controller.battlefield);
        addTestCard(swamp, opponent, opponent.battlefield);
        const dualLand = addTestCard({
            ...swamp, name: "Test dual land", subtypes: [BasicLandType.Swamp, BasicLandType.Island],
        }, opponent, controller.battlefield);
        addTestCard(swamp, opponent, opponent.hand);
        addTestCard(cardData[FOREST], opponent, opponent.battlefield);

        startNextUpkeep(opponent);
        gameEventManager.addEvent(new GameEvent_TapCard(dualLand));
        expect(dualLand.tapped).toBe(true);
        expect(game.stack.objects).toHaveLength(1);
        expect(game.stack.objects[0]).toBeInstanceOf(StackAbility);
        expect(game.stack.objects[0]).toMatchObject({ source: karma, controller });
        expect(game.pendingTargeter).toBeNull();
        expect(opponent.life).toBe(20);
        passPriorityRound();
        expect(opponent.life).toBe(18);
        expect(controller.life).toBe(20);

        startNextUpkeep(controller);
        expect(game.stack.objects).toHaveLength(1);
        passPriorityRound();
        expect(controller.life).toBe(19);
        expect(opponent.life).toBe(18);
    });

    test("counts Swamps at resolution even if Karma has left the battlefield", () => {
        const karma = addTestCard(def, controller, controller.battlefield);
        const original = addTestCard(swamp, opponent, opponent.battlefield);

        startNextUpkeep(opponent);
        expect(game.stack.objects).toHaveLength(1);
        moveTestCard(original, opponent.graveyard);
        addTestCard(swamp, opponent, opponent.battlefield);
        addTestCard(swamp, opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(karma));

        const onDamage = vi.fn();
        const stopListening = gameEventManager.onGamePerformed(GameEventType.DealDamage, onDamage);
        try {
            passPriorityRound();
            expect(opponent.life).toBe(18);
            expect(onDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: karma, recipient: opponent, amount: 2 }));
        } finally {
            stopListening();
        }

        startNextUpkeep(controller);
        expect(game.stack.objects).toHaveLength(0);
    });

    test("still triggers on the upkeep of a player with zero Swamps", () => {
        addTestCard(def, controller, controller.battlefield);
        addTestCard(swamp, controller, controller.battlefield);

        startNextUpkeep(opponent);
        expect(game.stack.objects).toHaveLength(1);
        passPriorityRound();
        expect(game.stack.objects).toHaveLength(0);
        expect(opponent.life).toBe(20);
        expect(controller.life).toBe(20);
    });
});

describe("Lance", () => {
    const def = cardData.find(card => card.name === "Lance");
    const plainsDef = cardData.find(card => card.name === BasicLandType.Plains);
    let caster: Player;
    let opponent: Player;
    let lance: CardObject;
    let plains: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        lance = addTestCard(def, caster, caster.hand);
        plains = addTestCard(plainsDef, caster, caster.battlefield);
    });

    function castLance(target: Permanent) {
        const [cast] = playerActionManager.getCardActions(lance, caster);
        cast.perform(caster);
        const request = game.pendingTargeter;
        expect(request.validateTargets([plains])).toBe(false);
        expect(plains.tapped).toBe(false);

        request.onTargeted([target]);
        expect(plains.tapped).toBe(true);
        expect(target.hasKeyword(Keyword.FirstStrike)).toBe(false);
        passPriorityRound();

        const aura = caster.battlefield.objects.find(object => object.card === lance.card);
        expect(aura?.attachedTo).toBe(target);
        expect(target.hasKeyword(Keyword.FirstStrike)).toBe(true);
        return aura;
    }

    test("enchants either player's creature and transfers the grant with the Aura", () => {
        const friendlyCard = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.hand);
        expect(playerActionManager.getCardActions(lance, caster)).toHaveLength(0);

        const opposing = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const aura = castLance(opposing);
        const friendly = moveTestCard(friendlyCard, caster.battlefield);
        expect(friendly.hasKeyword(Keyword.FirstStrike)).toBe(false);

        gameEventManager.addEvent(new GameEvent_AttachPermanent(aura, friendly));
        expect(opposing.hasKeyword(Keyword.FirstStrike)).toBe(false);
        expect(friendly.hasKeyword(Keyword.FirstStrike)).toBe(true);

        moveTestCard(aura, caster.graveyard);
        expect(friendly.hasKeyword(Keyword.FirstStrike)).toBe(false);
    });

    test("lets the enchanted creature win combat against an equal blocker", () => {
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const blocker = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        castLance(attacker);

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        new PlayerActions.DeclareAttacker(attacker).perform(caster, [opponent]);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
        new PlayerActions.DeclareBlocker(blocker).perform(opponent, [attacker]);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.FirstStrikeDamage));

        expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
        expect(blocker.retired).toBe(true);
        passPriorityRound();
        expect(attacker.zone).toBe(caster.battlefield);
        expect(attacker.damageTaken).toBe(0);
    });
});

describe("Lord of Atlantis", () => {
    const def = cardData.find(card => card.name === "Lord of Atlantis");
    const merfolk: CardDef = {
        ...cardData[GRIZZLY_BEARS],
        name: "Test Merfolk",
        subtypes: ["Merfolk"],
        power: 1,
        toughness: 1,
    };
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
    });

    test("casts for {U}{U} and gives other Merfolk on both sides +1/+1 and islandwalk", () => {
        startMainPhase();
        const card = addTestCard(def, caster, caster.hand);
        const friendly = addTestCard(merfolk, caster, caster.battlefield);
        const opposing = addTestCard(merfolk, opponent, opponent.hand);
        const bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.U] = 1;
        caster.manaPool[ManaColour.G] = 1;
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);

        caster.manaPool[ManaColour.U] = 2;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(friendly).toMatchObject({ power: 1, toughness: 1 });

        passPriorityRound();
        const lord = caster.battlefield.objects.find(object => object.card === card.card);
        expect(lord).toMatchObject({ power: 2, toughness: 2 });
        expect(lord.hasKeyword(Keyword.Islandwalk)).toBe(false);
        expect(opposing).toMatchObject({ power: 1, toughness: 1 });
        expect(opposing.hasKeyword(Keyword.Islandwalk)).toBe(false);
        expect(bear).toMatchObject({ power: 2, toughness: 2 });
        expect(bear.hasKeyword(Keyword.Islandwalk)).toBe(false);

        const opposingPermanent = moveTestCard(opposing, opponent.battlefield);
        for (const recipient of [friendly, opposingPermanent]) {
            expect(recipient).toMatchObject({ power: 2, toughness: 2 });
            expect(recipient.hasKeyword(Keyword.Islandwalk)).toBe(true);
        }
        opposingPermanent.subtypes = ["Bear"];
        expect(opposingPermanent).toMatchObject({ power: 1, toughness: 1 });
        expect(opposingPermanent.hasKeyword(Keyword.Islandwalk)).toBe(false);
        opposingPermanent.subtypes = merfolk.subtypes;
        expect(opposingPermanent).toMatchObject({ power: 2, toughness: 2 });
        expect(opposingPermanent.hasKeyword(Keyword.Islandwalk)).toBe(true);
    });

    test("two Lords grant each other islandwalk and stack their bonuses on other Merfolk", () => {
        const lord = addTestCard(def, caster, caster.battlefield);
        const otherLord = addTestCard(def, opponent, opponent.battlefield);
        const friendly = addTestCard(merfolk, caster, caster.battlefield);
        const blocker = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        addTestCard(cardData.find(card => card.name === BasicLandType.Island), opponent, opponent.battlefield);
        for (const recipient of [lord, otherLord, friendly]) {
            expect(recipient).toMatchObject({ power: 3, toughness: 3 });
            expect(recipient.hasKeyword(Keyword.Islandwalk)).toBe(true);
        }

        game.startGame({ allowAutoSkip: false });
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        new PlayerActions.DeclareAttacker(lord).perform(caster, [opponent]);
        gameEventManager.addEvent(new GameEvent_Advance(caster));
        expect(CombatManager.canBlockAttacker(blocker, lord)).toBe(false);

        moveTestCard(otherLord, opponent.graveyard);
        expect(lord).toMatchObject({ power: 2, toughness: 2 });
        expect(lord.hasKeyword(Keyword.Islandwalk)).toBe(false);
        expect(CombatManager.canBlockAttacker(blocker, lord)).toBe(true);
        expect(friendly).toMatchObject({ power: 2, toughness: 2 });
        expect(friendly.hasKeyword(Keyword.Islandwalk)).toBe(true);

        moveTestCard(lord, caster.graveyard);
        expect(friendly).toMatchObject({ power: 1, toughness: 1 });
        expect(friendly.hasKeyword(Keyword.Islandwalk)).toBe(false);
    });
});
