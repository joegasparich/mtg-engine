import playerActionManager,{ TargetType,TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { PlayerActions } from "@engine/actions";
import { type CardObject,type Permanent,type Spell,StackAbility } from "@engine/GameObject";
import { type Zone,ZoneKind } from "@engine/Zone";
import { CombatManager } from "@engine/CombatManager";
import { CardChoiceVisibility,GameEvent_ActivateAbility,GameEvent_Advance,GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_Cleanup,GameEvent_DealDamage,GameEvent_DeclareAttacker,GameEvent_DestroyPermanent,GameEvent_DrawCard,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_TapCard,GameEvent_UntapCard,ManaPaymentDecision,OptionalDecision } from "@engine/events";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import { GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import { ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { type EventCheck,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,chooseEarliestTimestamps,ANCESTRAL_RECALL,BASIC_DECK,FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { BasicLandType,type CardColour,type CardDef,cardColours,CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

describe("Disenchant", () => {
    const def = cardData.find(card => card.name === "Disenchant");
    const castle = cardData.find(card => card.name === "Castle");
    const artifact: CardDef = { ...castle, name: "Test artifact", types: [CardType.Artifact], abilities: [] };
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
        types: [CardType.Instant],
        cost: "{R}",
        abilities: [{ parts: {
            AbilityPart_Target: {
                saveAs: "VICTIM", validTargets: [TargetTypeKeys.Permanent],
                targetValidator: { cardType: CardType.Creature },
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
                saveAs: "TARGET", validTargets: [TargetTypeKeys.Permanent],
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
    expect(def).toMatchObject({ types: [CardType.Enchantment], cost: "{1}{W}" });
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

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        if (controller === caster)
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
                AbilityPart_SelectObjectsContinuously: { target: "THIS.attachedTo", saveAs: "ENCHANTED_CREATURE" },
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

            chooseEarliestTimestamps(caster, ...casterLands.slice(1));
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
        expect(game.pendingResolutionChoice.visibility).toBe(CardChoiceVisibility.Private);
        chooseEarliestTimestamps(caster, discard[1]);

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
        startMainPhase();
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
        chooseEarliestTimestamps(attacker, second);
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
        startMainPhase();
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

    test("a creature must still be controlled by the defending player when Blaze resolves", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        startMainPhase();
        expect(blaze.spellTargeter.hasLegalTargets()).toBe(false);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.BeginningOfCombat));
        expect(blaze.spellTargeter.hasLegalTargets()).toBe(true);
        gameEventManager.addEvent(new GameEvent_CastSpell(attacker, blaze, [blocker]));
        expect(game.stack.objects[0]).toMatchObject({ card: blaze.card, targets: [blocker] });

        blocker.controller = attacker;
        passPriorityRound();
        expect(CombatManager.blockLimit(blocker)).toBe(1);
        expect(blocker.abilities).toHaveLength(0);
        expect(attacker.graveyard.objects.map(object => object.card)).toEqual([blaze.card]);
    });

    test("loses its target if the creature leaves and returns before resolution", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        startMainPhase();
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
        startMainPhase();
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
        startMainPhase();
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

test("Mesa Pegasus can band with Pearled Unicorn and is blocked when the Unicorn is blocked", () => {
    Game.init();
    const attacker = game.addPlayer(BASIC_DECK);
    const defender = game.addPlayer(BASIC_DECK);
    const pegasus = addTestCard(cardData.find(card => card.name === "Mesa Pegasus"), attacker, attacker.battlefield);
    const unicorn = addTestCard(cardData.find(card => card.name === "Pearled Unicorn"), attacker, attacker.battlefield);
    const blocker = addTestCard(cardData[GRIZZLY_BEARS], defender, defender.battlefield);

    game.startGame({ allowAutoSkip: false });
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    for (const creature of [pegasus, unicorn])
        new PlayerActions.DeclareAttacker(creature).perform(attacker, [defender]);
    expect(CombatManager.setAttackingBands(attacker, [[pegasus, unicorn]])).toBe(true);

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
    const block = new PlayerActions.DeclareBlocker(blocker);
    block.perform(defender, [pegasus]);
    expect(CombatManager.isBlocked(pegasus)).toBe(false);
    block.perform(defender, [unicorn]);
    expect([...CombatManager.blockRelationships()]).toEqual([[blocker, pegasus], [blocker, unicorn]]);
});

describe("Northern Paladin", () => {
    const def = cardData.find(card => card.name === "Northern Paladin");
    const plains = cardData.find(card => card.name === BasicLandType.Plains);
    const blackEnchantment: CardDef = {
        ...cardData[GRIZZLY_BEARS], types: [CardType.Enchantment], cost: "{W}{B}",
    };
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
    });

    test("casts for {2}{W}{W} and can pay {W}{W} and tap on its controller's next turn", () => {
        startMainPhase();
        const card = addTestCard(def, caster, caster.hand);
        const target = addTestCard(blackEnchantment, opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 1;
        caster.manaPool[ManaColour.G] = 3;
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        caster.manaPool[ManaColour.W] = 2;
        caster.manaPool[ManaColour.G] = 2;

        new PlayerActions.PlayCard(card).perform(caster);
        expect(game.pendingTargeter).toBeNull();
        expect(caster.manaPool.every(amount => amount === 0)).toBe(true);
        passPriorityRound();
        const paladin = caster.battlefield.objects.find(object => object.card === card.card);
        expect(paladin).toMatchObject({ power: 3, toughness: 3, tapped: false });
        const lands = Array.from({ length: 2 }, () => addTestCard(plains, caster, caster.battlefield));
        expect(playerActionManager.getCardActions(paladin, caster)).toHaveLength(0);

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        gameEventManager.addEvent(new GameEvent_Advance(opponent));
        expect(game.priorityPlayer).toBe(caster);
        expect(playerActionManager.getCardActions(paladin, caster)).toHaveLength(0);

        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        const [activate] = playerActionManager.getCardActions(paladin, caster);
        activate.perform(caster);
        expect(paladin.tapped || lands.some(land => land.tapped)).toBe(false);
        game.pendingTargeter.onTargeted([target]);
        expect(paladin.tapped && lands.every(land => land.tapped)).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(game.stack.objects).toEqual([expect.any(StackAbility)]);
        expect(target.zone).toBe(opponent.battlefield);
        passPriorityRound();
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([target.card]);
    });

    test("requires a black permanent and allows cancelling without paying either cost", () => {
        const paladin = addTestCard(def, caster, caster.battlefield);
        const nonblack = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const blackCardInHand = addTestCard(blackEnchantment, opponent, opponent.hand);
        startMainPhase();
        caster.manaPool[ManaColour.W] = 2;
        expect(playerActionManager.getCardActions(paladin, caster)).toHaveLength(0);

        const friendlyTarget = addTestCard(blackEnchantment, caster, caster.battlefield);
        const [activate] = playerActionManager.getCardActions(paladin, caster);
        activate.perform(caster);
        const request = game.pendingTargeter;
        expect(request.validateTargets([nonblack])).toBe(false);
        expect(request.validateTargets([blackCardInHand])).toBe(false);
        expect(request.validateTargets([friendlyTarget])).toBe(true);
        request.onCancelled();
        expect(paladin.tapped).toBe(false);
        expect(caster.manaPool[ManaColour.W]).toBe(2);
        expect(game.stack.objects).toHaveLength(0);

        activate.perform(caster);
        game.pendingTargeter.onTargeted([friendlyTarget]);
        moveTestCard(paladin, caster.graveyard);
        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([paladin.card, friendlyTarget.card]);
    });

    test("rechecks the target's colour on resolution", () => {
        const paladin = addTestCard(def, caster, caster.battlefield);
        const target = addTestCard(blackEnchantment, opponent, opponent.battlefield);
        startMainPhase();
        caster.manaPool[ManaColour.W] = 2;
        new PlayerActions.ActivateAbility(paladin, paladin.abilities[0]).perform(caster);
        game.pendingTargeter.onTargeted([target]);
        target.colours = new Set(["W"]);

        passPriorityRound();
        expect(target.zone).toBe(opponent.battlefield);
        expect(game.stack.objects).toHaveLength(0);
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

describe("Personal Incarnation", () => {
    const def = cardData.find(card => card.name === "Personal Incarnation");
    let owner: Player;
    let opponent: Player;
    let source: Permanent;

    beforeEach(() => {
        Game.init();
        owner = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        source = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    });

    function activate(incarnation: Permanent) {
        const [action] = playerActionManager.getCardActions(incarnation, owner);
        expect(action).toBeInstanceOf(PlayerActions.ActivateAbility);
        action.perform(owner);
    }

    function addStolenIncarnation(): Permanent {
        const card = addTestCard(def, owner, owner.hand);
        const enter = new GameEvent_ChangeCardZone(card, opponent.battlefield, { controller: opponent });
        gameEventManager.addEvent(enter);
        return enter.newObject as Permanent;
    }

    test("casts a 6/6 Avatar Incarnation for {3}{W}{W}{W}", () => {
        const card = addTestCard(def, owner, owner.hand);
        owner.manaPool[ManaColour.W] = 2;
        owner.manaPool[ManaColour.G] = 4;
        expect(playerActionManager.getCardActions(card, owner)).toHaveLength(0);

        owner.manaPool[ManaColour.W]++;
        const [cast] = playerActionManager.getCardActions(card, owner);
        cast.perform(owner);
        passPriorityRound();

        expect(owner.manaPool[ManaColour.W]).toBe(0);
        expect(owner.manaPool[ManaColour.G]).toBe(1);
        expect(owner.battlefield.objects.find(object => object.card === card.card)).toMatchObject({
            power: 6, toughness: 6, subtypes: ["Avatar", "Incarnation"],
        });
    });

    test("each free activation uses the stack and redirects one point of damage", () => {
        const incarnation = addTestCard(def, owner, owner.battlefield);
        activate(incarnation);
        activate(incarnation);
        expect(game.stack.objects).toHaveLength(2);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 1));
        expect(owner.life).toBe(20);
        expect(incarnation.damageTaken).toBe(1);

        passPriorityRound();
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 3));
        expect(owner.life).toBe(18);
        expect(incarnation.damageTaken).toBe(2);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 1));
        expect(owner.life).toBe(18);
        expect(incarnation.damageTaken).toBe(3);
    });

    test("the owner can activate it from an opponent's battlefield and the controller cannot", () => {
        const incarnation = addStolenIncarnation();
        expect(playerActionManager.getAvailableActions(owner).has(incarnation)).toBe(true);
        activate(incarnation);
        expect(game.stack.objects[0]).toMatchObject({ controller: owner, source: incarnation });
        gameEventManager.addEvent(new GameEvent_Advance(owner));
        expect(game.priorityPlayer).toBe(opponent);
        expect(playerActionManager.getCardActions(incarnation, opponent)).toHaveLength(0);
        expect(gameEventManager.performImmediate(new GameEvent_ActivateAbility(opponent, incarnation, incarnation.abilities[0]))).toBe(false);
        gameEventManager.addEvent(new GameEvent_Advance(opponent));

        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 1));
        expect(owner.life).toBe(19);
        expect(opponent.life).toBe(20);
        expect(incarnation.damageTaken).toBe(0);
    });

    test("unused redirection expires during cleanup", () => {
        const incarnation = addTestCard(def, owner, owner.battlefield);
        activate(incarnation);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_Cleanup(owner));

        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 1));
        expect(owner.life).toBe(20);
        expect(incarnation.damageTaken).toBe(1);
    });

    test("returning to the battlefield gives the card a new object and moving to hand triggers no life loss", () => {
        const incarnation = addTestCard(def, owner, owner.battlefield);
        activate(incarnation);
        passPriorityRound();
        activate(incarnation);
        const returned = moveTestCard(moveTestCard(incarnation, owner.hand), owner.battlefield);
        expect(game.stack.objects).toHaveLength(1);
        passPriorityRound();

        gameEventManager.addEvent(new GameEvent_DealDamage(source, returned, 1));
        expect(returned.damageTaken).toBe(1);
        expect(owner.life).toBe(20);
    });

    test("a stolen Incarnation's death trigger uses its owner's life at resolution", () => {
        const incarnation = addStolenIncarnation();
        gameEventManager.addEvent(new GameEvent_SacrificePermanent(opponent, incarnation));
        expect(owner.graveyard.objects.at(-1).card).toBe(incarnation.card);
        expect(game.stack.objects[0]).toMatchObject({ controller: opponent, source: incarnation });
        expect(owner.life).toBe(20);

        gameEventManager.addEvent(new GameEvent_DealDamage(source, owner, 3));
        passPriorityRound();
        expect(owner.life).toBe(8);
        expect(opponent.life).toBe(20);
    });

    test("lethal damage triggers the life loss through state-based actions", () => {
        const incarnation = addTestCard(def, owner, owner.battlefield);
        activate(incarnation);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(source, incarnation, 7));
        expect(owner.life).toBe(19);
        expect(owner.graveyard.objects.at(-1).card).toBe(incarnation.card);
        expect(game.stack.objects).toHaveLength(1);

        passPriorityRound();
        expect(owner.life).toBe(9);
    });
});

describe("Purelace", () => {
    const def = cardData.find(card => card.name === "Purelace");
    const creature = cardData[GRIZZLY_BEARS];
    let caster: Player;
    let opponent: Player;
    let card: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        card = addTestCard(def, caster, caster.hand);
    });

    test("pays {W} and recolours a permanent through cleanup", () => {
        const target = addTestCard({ ...creature, cost: "{G}{U}" }, opponent, opponent.battlefield);
        const inHand = addTestCard(creature, opponent, opponent.hand);
        const inGraveyard = addTestCard(creature, opponent, opponent.graveyard);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        const plains = cardData.find(card => card.name === BasicLandType.Plains);
        const whiteSource = addTestCard(plains, caster, caster.battlefield);
        const cost = [...target.cost];

        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        const request = game.pendingTargeter;
        expect(request.targetType).toBe(TargetType.Spell | TargetType.Permanent);
        expect(request.validateTargets([opponent])).toBe(false);
        expect(request.validateTargets([inHand])).toBe(false);
        expect(request.validateTargets([inGraveyard])).toBe(false);
        expect(request.validateTargets([whiteSource])).toBe(true);
        request.onTargeted([target]);
        expect(whiteSource.tapped).toBe(true);
        expect(target.colours).toEqual(new Set(["G", "U"]));

        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
        gameEventManager.addEvent(new GameEvent_Cleanup(caster));
        expect(target.colours).toEqual(new Set(["W"]));
        expect(target.cost).toEqual(cost);

        const returned = moveTestCard(moveTestCard(target, opponent.hand), opponent.battlefield);
        expect(returned.colours).toEqual(new Set(["G", "U"]));
    });

    test("can target a permanent spell and the new permanent enters white", () => {
        const inHand = addTestCard(creature, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, inHand)).toBe(true);
        const [spell] = game.stack.objects;
        caster.manaPool[ManaColour.W] = 1;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        game.pendingTargeter.onTargeted([spell]);
        expect(game.stack.objects).toHaveLength(2);

        passPriorityRound();
        expect(spell).toMatchObject({ colours: new Set(["W"]) });
        const onEntry = vi.fn((event: GameEvent_ChangeCardZone) => {
            expect(event.newObject.colours).toEqual(new Set(["W"]));
            expect(event.newObject.cost).toEqual(inHand.cost);
        });
        gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, onEntry, {
            matches: event => event.oldObject === spell && event.newZone === opponent.battlefield,
        });
        passPriorityRound();
        expect(onEntry).toHaveBeenCalledOnce();
    });

    test("recolours an instant on the stack and its graveyard card has its original colour", () => {
        const inHand = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, inHand, [opponent])).toBe(true);
        const [spell] = game.stack.objects;
        expect(game.stack.spellCast(caster, card, [spell])).toBe(true);
        const purelace = game.stack.objects.at(-1) as Spell;
        expect(purelace.spellTargeter.validateTargets([purelace])).toBe(false);

        passPriorityRound();
        expect(spell).toMatchObject({ colours: new Set(["W"]) });
        passPriorityRound();
        expect(opponent.graveyard.objects.at(-1)).toMatchObject({ card: inHand.card, colours: new Set(["U"]) });
    });

    test("fails to recolour a target that leaves and returns before resolution", () => {
        const target = addTestCard(creature, opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, card, [target])).toBe(true);
        const returned = moveTestCard(moveTestCard(target, opponent.hand), opponent.battlefield);

        passPriorityRound();
        expect(target.colours).toEqual(new Set(["G"]));
        expect(returned.colours).toEqual(new Set(["G"]));
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
    });
});

describe("Reverse Damage", () => {
    const def = cardData.find(card => card.name === "Reverse Damage");
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

    test("costs {1}{W}{W} and reverses only the chosen source's next damage to the caster", () => {
        const other = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
        const land = addTestCard(cardData[FOREST], caster, caster.battlefield);
        const hidden = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
        caster.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(card, caster)).toEqual([]);
        caster.manaPool[ManaColour.W] = 2;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(land.tapped).toBe(true);
        expect(game.pendingTargeter).toBeNull();
        expect(game.pendingResolutionChoice).toBeNull();

        const chosen = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        passPriorityRound();
        const choice = game.pendingResolutionChoice;
        expect(choice.player).toBe(caster);
        expect(choice.options).toContain(land);
        expect(choice.options).not.toContain(hidden);
        choice.submit(caster, [chosen]);
        expect(caster.graveyard.objects[0].card).toBe(card.card);
        gameEventManager.addEvent(new GameEvent_DealDamage(chosen, opponent, 2));
        gameEventManager.addEvent(new GameEvent_DealDamage(other, caster, 1));
        expect([caster.life, opponent.life]).toEqual([19, 18]);
        gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 4));
        expect(caster.life).toBe(23);
        gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 4));
        expect(caster.life).toBe(19);
    });

    test("can choose an instant on the stack before that spell deals damage", () => {
        const burn = addTestCard({
            ...cardData[ANCESTRAL_RECALL],
            abilities: [{ parts: {
                AbilityPart_Target: { saveAs: "TARGET", validTargets: ["Player"] },
                AbilityPart_Effect_DealDamage: { inSignal: "SPELL_RESOLVE", source: "THIS", target: "TARGET", amount: 3 },
            } }],
        }, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, burn, [caster])).toBe(true);
        const source = game.stack.objects[0] as Spell;
        expect(game.stack.spellCast(caster, card)).toBe(true);
        passPriorityRound();
        expect(game.pendingResolutionChoice.options).toContain(source);
        game.pendingResolutionChoice.submit(caster, [source]);
        expect(caster.life).toBe(20);
        passPriorityRound();
        expect(caster.life).toBe(23);
    });

    test("an unused shield expires during cleanup", () => {
        const source = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, card)).toBe(true);
        passPriorityRound();
        game.pendingResolutionChoice.submit(caster, [source]);
        gameEventManager.addEvent(new GameEvent_Cleanup(caster));
        gameEventManager.addEvent(new GameEvent_DealDamage(source, caster, 3));
        expect(caster.life).toBe(17);
    });
});

describe("Righteousness", () => {
    const def = cardData.find(card => card.name === "Righteousness");
    const lions = cardData.find(card => card.name === "Savannah Lions");
    let caster: Player;
    let defender: Player;
    let spell: CardObject;
    let attacker: Permanent;
    let blocker: Permanent;
    let idle: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        defender = game.addPlayer(BASIC_DECK);
        attacker = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        blocker = addTestCard(lions, defender, defender.battlefield);
        idle = addTestCard(lions, defender, defender.battlefield);
        startMainPhase();
        spell = addTestCard(def, caster, caster.hand);
        addTestCard(cardData.find(card => card.name === BasicLandType.Plains), caster, caster.battlefield);
        expect(playerActionManager.getCardActions(spell, caster)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        new PlayerActions.DeclareAttacker(attacker).perform(caster, [defender]);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
        new PlayerActions.DeclareBlocker(blocker).perform(defender, [attacker]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
    });

    test("casts for {W} on a blocking creature and gives it +7/+7 through the end of combat", () => {
        const [cast] = playerActionManager.getCardActions(spell, caster);
        cast.perform(caster);
        const choice = game.pendingTargeter;
        expect(choice.validateTargets([attacker])).toBe(false);
        expect(choice.validateTargets([idle])).toBe(false);
        expect(choice.validateTargets([blocker])).toBe(true);
        choice.onTargeted([blocker]);
        expect(blocker).toMatchObject({ power: 2, toughness: 1 });
        passPriorityRound();
        expect(blocker).toMatchObject({ power: 9, toughness: 8 });

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.SecondMain));
        expect(attacker.retired).toBe(true);
        expect(blocker).toMatchObject({ power: 9, toughness: 8, damageTaken: 2 });
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(blocker).toMatchObject({ power: 2, toughness: 1, damageTaken: 0 });
    });

    test("rechecks whether the target is still blocking on resolution", () => {
        expect(game.stack.spellCast(caster, spell, [blocker])).toBe(true);
        CombatManager.removeFromCombat(blocker);
        passPriorityRound();
        expect(blocker).toMatchObject({ power: 2, toughness: 1, zone: defender.battlefield });
        expect(caster.graveyard.objects.map(object => object.card)).toContain(spell.card);
    });
});

describe("Samite Healer", () => {
    const def = cardData.find(card => card.name === "Samite Healer");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
    });

    test("casts for {1}{W} as a 1/1 Human Cleric with summoning sickness", () => {
        startMainPhase();
        const card = addTestCard(def, caster, caster.hand);
        caster.manaPool[ManaColour.G] = 1;
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        caster.manaPool[ManaColour.W] = 1;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        expect(caster.manaPool.every(amount => amount === 0)).toBe(true);
        passPriorityRound();
        const healer = caster.battlefield.objects.find(object => object.card === card.card);
        expect(healer).toMatchObject({ power: 1, toughness: 1, subtypes: ["Human", "Cleric"], tapped: false });
        expect(playerActionManager.getCardActions(healer, caster)).toHaveLength(0);
    });

    test("taps to prevent exactly one damage to the chosen player after resolution", () => {
        const healer = addTestCard(def, caster, caster.battlefield);
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        startMainPhase();
        const [activate] = playerActionManager.getCardActions(healer, caster);
        activate.perform(caster);
        const choice = game.pendingTargeter;
        expect(choice.validateTargets([land])).toBe(false);
        expect(choice.validateTargets([caster])).toBe(true);
        expect(choice.validateTargets([healer])).toBe(true);
        expect(healer.tapped).toBe(false);
        choice.onTargeted([opponent]);
        expect(healer.tapped).toBe(true);
        expect(game.stack.objects).toEqual([expect.any(StackAbility)]);
        expect(playerActionManager.getCardActions(healer, caster)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, opponent, 1));
        expect(opponent.life).toBe(19);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, opponent, 3));
        expect(opponent.life).toBe(17);
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, opponent, 1));
        expect(opponent.life).toBe(16);
    });

    test("can protect a creature even if the Healer leaves before resolution", () => {
        const healer = addTestCard(def, caster, caster.battlefield);
        const bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        startMainPhase();
        const [activate] = playerActionManager.getCardActions(healer, caster);
        activate.perform(caster);
        game.pendingTargeter.onTargeted([bear]);
        // 113.7a: The activated ability resolves independently of the Healer.
        moveTestCard(healer, caster.graveyard);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DealDamage(bear, bear, 2));
        expect(bear.zone).toBe(opponent.battlefield);
        expect(bear.damageTaken).toBe(1);
    });
});

describe("Resurrection", () => {
    const def = cardData.find(card => card.name === "Resurrection");
    const creature = cardData[GRIZZLY_BEARS];
    let caster: Player;
    let opponent: Player;
    let card: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        card = addTestCard(def, caster, caster.hand);
    });

    test("costs {2}{W}{W} and returns only the chosen creature card from the caster's graveyard", () => {
        const target = addTestCard(creature, caster, caster.graveyard);
        const otherCreature = addTestCard(creature, caster, caster.graveyard);
        const land = addTestCard(cardData[FOREST], caster, caster.graveyard);
        const opposingCreature = addTestCard(creature, opponent, opponent.graveyard);
        const creatureInHand = addTestCard(creature, caster, caster.hand);
        caster.manaPool[ManaColour.W] = 1;
        caster.manaPool[ManaColour.G] = 3;
        expect(playerActionManager.getCardActions(card, caster)).toEqual([]);

        caster.manaPool[ManaColour.W] = 2;
        const [cast] = playerActionManager.getCardActions(card, caster);
        cast.perform(caster);
        const request = game.pendingTargeter;
        expect(request.zone).toBe(ZoneKind.Graveyard);
        expect(request.validateTargets([land])).toBe(false);
        expect(request.validateTargets([opposingCreature])).toBe(false);
        expect(request.validateTargets([creatureInHand])).toBe(false);
        request.onTargeted([target]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(caster.manaPool[ManaColour.G]).toBe(1);
        expect(target.zone).toBe(caster.graveyard);

        passPriorityRound();
        expect(caster.battlefield.objects).toEqual([expect.objectContaining({ card: target.card, controller: caster, tapped: false })]);
        expect(target.retired).toBe(true);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([otherCreature.card, land.card, card.card]);
        expect(opposingCreature.zone).toBe(opponent.graveyard);
    });

    test("cannot be cast without a creature card in the caster's graveyard", () => {
        caster.manaPool[ManaColour.W] = 4;
        addTestCard(cardData[FOREST], caster, caster.graveyard);
        addTestCard(creature, opponent, opponent.graveyard);
        expect(playerActionManager.getCardActions(card, caster)).toEqual([]);
    });

    test("fails when the target leaves and returns to the graveyard before resolution", () => {
        const target = addTestCard(creature, caster, caster.graveyard);
        expect(game.stack.spellCast(caster, card, [target])).toBe(true);
        const returned = moveTestCard(moveTestCard(target, caster.hand), caster.graveyard);

        passPriorityRound();
        expect(caster.battlefield.objects).toEqual([]);
        expect(caster.graveyard.objects[0]).toBe(returned);
        expect(caster.graveyard.objects[1].card).toBe(card.card);
    });
});

describe("Swords to Plowshares", () => {
    const def = cardData.find(card => card.name === "Swords to Plowshares");
    let caster: Player;
    let opponent: Player;
    let swords: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        swords = addTestCard(def, caster, caster.hand);
    });

    test("costs {W}, exiles a creature, then gives its last controller life equal to its modified power", () => {
        const target = addTestCard(cardData.find(card => card.name === "Personal Incarnation"), caster, caster.battlefield);
        const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        expect(playerActionManager.getCardActions(swords, caster)).toEqual([]);
        caster.manaPool[ManaColour.W] = 1;
        const [cast] = playerActionManager.getCardActions(swords, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([land])).toBe(false);
        expect(game.pendingTargeter.validateTargets([opponent])).toBe(false);
        game.pendingTargeter.onTargeted([target]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);

        target.controller = opponent;
        addTestCard(cardData.find(card => card.name === "Crusade"), opponent, opponent.battlefield);
        expect(target.power).toBe(7);
        gameEventManager.onGamePerformed(GameEventType.ChangeCardZone, (event: GameEvent_ChangeCardZone) => {
            if (event.oldObject === target)
                expect(opponent.life).toBe(20);
        });
        passPriorityRound();

        expect(game.exile.objects).toEqual([expect.objectContaining({ card: target.card, power: 6 })]);
        expect(opponent.life).toBe(27);
        expect(caster.life).toBe(20);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([swords.card]);
        expect(game.stack.objects).toEqual([]); // Personal Incarnation's dies ability did not trigger.
    });

    test.each([0, -2])("exiles an indestructible creature with %i power and gives no life", power => {
        const target = addTestCard({
            ...cardData[GRIZZLY_BEARS], power, abilities: [{ keyword: Keyword.Indestructible, parts: {} }],
        }, caster, caster.battlefield);
        expect(game.stack.spellCast(caster, swords, [target])).toBe(true);
        passPriorityRound();

        expect(game.exile.objects.map(object => object.card)).toEqual([target.card]);
        expect(caster.life).toBe(20);
    });

    test("a creature that leaves and returns in response is a new object and its controller gains no life", () => {
        const target = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, swords, [target])).toBe(true);
        const returned = moveTestCard(moveTestCard(target, opponent.hand), opponent.battlefield);
        passPriorityRound();

        expect(returned.zone).toBe(opponent.battlefield);
        expect(game.exile.objects).toEqual([]);
        expect(opponent.life).toBe(20);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([swords.card]);
    });

    test("a legal target's controller still gains life if an effect prevents the exile", () => {
        const target = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const preventExile = (check: EventCheck) => check.removeWhere(event =>
            event instanceof GameEvent_ChangeCardZone && event.oldObject === target && event.newZone === game.exile);
        gameEventManager.onCheck(preventExile);
        try {
            expect(game.stack.spellCast(caster, swords, [target])).toBe(true);
            passPriorityRound();
        } finally {
            gameEventManager.offCheck(preventExile);
        }
        expect(target.zone).toBe(opponent.battlefield);
        expect(game.exile.objects).toEqual([]);
        expect(opponent.life).toBe(22);
    });
});

describe("Veteran Bodyguard", () => {
    const def = cardData.find(card => card.name === "Veteran Bodyguard");
    let active: Player;
    let defender: Player;
    let guard: Permanent;
    let attacker: Permanent;

    beforeEach(() => {
        Game.init();
        active = game.addPlayer(BASIC_DECK);
        defender = game.addPlayer(BASIC_DECK);
        attacker = addTestCard(cardData[GRIZZLY_BEARS], active, active.battlefield);
        guard = addTestCard(def, defender, defender.battlefield);
    });

    function declareAttackers(...attackers: Permanent[]) {
        startMainPhase();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        for (const creature of attackers)
            new PlayerActions.DeclareAttacker(creature).perform(active, [defender]);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
    }

    test("takes all simultaneous damage from unblocked attackers, even when the total is lethal", () => {
        const angel = addTestCard(cardData.find(card => card.name === "Serra Angel"), active, active.battlefield);
        declareAttackers(attacker, angel);
        const hits: GameEvent_DealDamage[] = [];
        gameEventManager.onGamePerformed(GameEventType.DealDamage, (event: GameEvent_DealDamage) => hits.push(event));
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        passPriorityRound();

        expect(hits.map(hit => [hit.source, hit.recipient, hit.amount])).toEqual([[attacker, guard, 2], [angel, guard, 4]]);
        expect(defender.life).toBe(20);
        expect(defender.graveyard.objects.map(object => object.card)).toContain(guard.card);
    });

    test("also redirects noncombat damage, but only while untapped and only for its current controller", () => {
        declareAttackers(attacker);
        const hit = (player: Player) => gameEventManager.addEvent(new GameEvent_DealDamage(attacker, player, 1));
        hit(defender); // 509.1h: The attacker has no blocked or unblocked status yet.
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        hit(defender);
        gameEventManager.addEvent(new GameEvent_TapCard(guard));
        hit(defender);
        gameEventManager.addEvent(new GameEvent_UntapCard(guard));
        guard.controller = active;
        hit(defender);
        hit(active);

        expect(guard.damageTaken).toBe(2);
        expect(defender.life).toBe(17);
        expect(active.life).toBe(20);
    });

    test("a blocked attacker remains blocked after its blocker leaves", () => {
        const blocker = addTestCard(cardData[GRIZZLY_BEARS], defender, defender.battlefield);
        declareAttackers(attacker);
        new PlayerActions.DeclareBlocker(blocker).perform(defender, [attacker]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        moveTestCard(blocker, defender.hand);
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, defender, 3));
        passPriorityRound();

        expect(guard.damageTaken).toBe(0);
        expect(defender.life).toBe(17);
    });

    test("the defender chooses a Bodyguard independently for each unblocked attacker", () => {
        const otherGuard = addTestCard(def, defender, defender.battlefield);
        const otherAttacker = addTestCard(cardData[MONS_GOBLIN_RAIDERS], active, active.battlefield);
        declareAttackers(attacker, otherAttacker);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        passPriorityRound();

        for (const [source, destination] of [[attacker, otherGuard], [otherAttacker, guard]]) {
            const choice = game.pendingDamagePreventionChoice;
            if (choice?.kind !== ResolutionChoiceKind.DamagePreventionOrder)
                throw new Error("Expected a choice between Veteran Bodyguards");
            expect(choice.player).toBe(defender);
            const option = choice.options.findIndex(label => label.includes(source.logName) && label.includes(destination.logName));
            expect(option).toBeGreaterThanOrEqual(0);
            choice.submit(defender, option);
        }
        expect(otherGuard.damageTaken).toBe(2);
        expect(guard.damageTaken).toBe(1);
        expect(defender.life).toBe(20);
    });
});

test("White Knight prevents black damage, refuses black blockers, and deals first strike damage to a legal blocker", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const knight = addTestCard(cardData.find(card => card.name === "White Knight"), player, player.battlefield);
    const black = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: "{B}{B}" }, opponent, opponent.battlefield);
    const green = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    startMainPhase();
    gameEventManager.addEvent(new GameEvent_DealDamage(black, knight, 2));
    expect(knight.damageTaken).toBe(0);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(knight).perform(player, [opponent]);
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
    expect(CombatManager.canBlockAttacker(black, knight)).toBe(false);
    expect(CombatManager.canBlockAttacker(green, knight)).toBe(true);
    new PlayerActions.DeclareBlocker(green).perform(opponent, [knight]);
    gameEventManager.addEvent(new GameEvent_Advance(opponent));
    passPriorityRound();
    expect(game.currentStepIndex).toBe(StepIndex.FirstStrikeDamage);
    expect(green.retired).toBe(true);
    passPriorityRound();
    expect(knight.zone).toBe(player.battlefield);
    expect(knight.damageTaken).toBe(0);
});

describe("Wrath of God", () => {
    const wrath = cardData.find(card => card.name === "Wrath of God");
    const ward = cardData.find(card => card.name === "Death Ward");
    let caster: Player;
    let opponent: Player;
    let spell: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
        spell = addTestCard(wrath, caster, caster.hand);
    });

    test("casts for {2}{W}{W} and destroys both players' creatures simultaneously through a Death Ward", () => {
        const friendly = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const opposing = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        const survivor = addTestCard({
            ...cardData[GRIZZLY_BEARS], abilities: [{ keyword: Keyword.Indestructible, parts: {} }],
        }, opponent, opponent.battlefield);
        const response = addTestCard(ward, opponent, opponent.hand);

        caster.manaPool[ManaColour.G] = 3;
        caster.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(spell, caster)).toEqual([]);
        caster.manaPool[ManaColour.W] = 2;
        playerActionManager.getCardActions(spell, caster)[0].perform(caster);
        expect(game.pendingTargeter).toBeNull();
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(caster.manaPool[ManaColour.G]).toBe(1);
        expect(game.stack.spellCast(opponent, response, [opposing])).toBe(true);
        passPriorityRound();

        const destroyed = vi.fn(() => {
            expect(friendly.retired && opposing.retired).toBe(true);
        });
        gameEventManager.onGamePerformed(GameEventType.DestroyPermanent, destroyed);
        passPriorityRound();
        expect(destroyed).toHaveBeenCalledTimes(2);
        expect(opponent.battlefield.objects).toEqual([land, survivor]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([friendly.card, spell.card]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([response.card, opposing.card]);
    });

    test("allows regeneration from a different destruction while Wrath waits on the stack", () => {
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        expect(game.stack.spellCast(caster, spell)).toBe(true);
        const response = addTestCard(ward, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, response, [creature])).toBe(true);
        passPriorityRound();
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(creature));
        expect(creature.zone).toBe(opponent.battlefield);
        expect(creature.tapped).toBe(true);
        passPriorityRound();
        expect(creature.retired).toBe(true);
    });

    test("also bypasses regeneration from a creature's activated ability", () => {
        const creature = addTestCard({
            ...cardData[GRIZZLY_BEARS],
            abilities: [{ parts: {
                AbilityPart_Activate_Mana: { cost: "{0}" },
                AbilityPart_Effect_Regenerate: { recipient: "THIS" },
            } }],
        }, caster, caster.battlefield);
        expect(game.stack.spellCast(caster, spell)).toBe(true);
        new PlayerActions.ActivateAbility(creature, creature.abilities[0]).perform(caster);
        expect(game.stack.objects.at(-1)).toBeInstanceOf(StackAbility);
        passPriorityRound();
        expect(creature.zone).toBe(caster.battlefield);
        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([creature.card, spell.card]);
    });

    test("allows a replacement that returns a creature to hand instead of destroying it", () => {
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const returnToHand = (check: EventCheck) => {
            for (const event of check.events) {
                if (event instanceof GameEvent_DestroyPermanent && event.permanent === creature)
                    check.replace(event, new GameEvent_ChangeCardZone(creature, opponent.hand));
            }
        };
        gameEventManager.withCheckSource({ object: creature }, () => gameEventManager.onCheck(returnToHand));
        try {
            expect(game.stack.spellCast(caster, spell)).toBe(true);
            passPriorityRound();
            expect(opponent.hand.objects.map(object => object.card)).toContain(creature.card);
            expect(opponent.graveyard.objects).toHaveLength(0);
        } finally {
            gameEventManager.offCheck(returnToHand);
        }
    });
});

describe("Black Lotus", () => {
    const lotus = cardData.find(card => card.name === "Black Lotus");
    let player: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        player = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
    });

    test.each(cardColours)("casts for zero and can immediately tap and sacrifice for three %s mana", colour => {
        const card = addTestCard(lotus, player, player.hand);
        const [cast] = playerActionManager.getCardActions(card, player);
        cast.perform(player);
        passPriorityRound();
        const [artifact] = player.battlefield.objects;
        expect(artifact).toMatchObject({ card: card.card, types: [CardType.Artifact], tapped: false });
        const [activate] = playerActionManager.getCardActions(artifact, player);
        activate.perform(player);

        expect(artifact.tapped).toBe(true);
        expect(player.graveyard.objects.map(object => object.card)).toEqual([card.card]);
        expect(game.stack.objects).toHaveLength(0);
        const choice = game.pendingColourChoice;
        expect(choice.player).toBe(player);
        choice.submit(opponent, colour);
        choice.submit(player, "C" as CardColour);
        expect(game.pendingColourChoice).toBe(choice);
        expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);

        choice.submit(player, colour);
        choice.submit(player, colour);
        expect(game.pendingColourChoice).toBeNull();
        expect(player.manaPool[ManaColour[colour]]).toBe(3);
        expect(player.manaPool.reduce((total, amount) => total + amount, 0)).toBe(3);
    });

    test("the controller chooses and spends the mana while the sacrificed card goes to its owner", () => {
        const artifact = addTestCard(lotus, opponent, player.battlefield);
        artifact.controller = player;
        const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
        expect(playerActionManager.getCardActions(bears, player)).toHaveLength(0);
        artifact.tapped = true;
        expect(playerActionManager.getCardActions(artifact, player)).toHaveLength(0);
        artifact.tapped = false;
        playerActionManager.getCardActions(artifact, player)[0].perform(player);
        expect(game.pendingColourChoice.player).toBe(player);
        game.pendingColourChoice.submit(player, "G");
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([artifact.card]);
        expect(opponent.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        playerActionManager.getCardActions(bears, player)[0].perform(player);
        expect(player.manaPool[ManaColour.G]).toBe(1);
        passPriorityRound();
        expect(player.battlefield.objects.map(object => object.card)).toEqual([bears.card]);
    });

    test("a prohibited sacrifice leaves Lotus untapped and produces no mana", () => {
        const artifact = addTestCard(lotus, player, player.battlefield);
        const preventSacrifice = (check: EventCheck) => check.removeWhere(event =>
            event instanceof GameEvent_SacrificePermanent && event.permanent === artifact);
        gameEventManager.onCheck(preventSacrifice);
        try {
            expect(playerActionManager.getCardActions(artifact, player)).toHaveLength(0);
            gameEventManager.addEvent(new GameEvent_ActivateAbility(player, artifact, artifact.abilities[0]));
            expect(artifact.tapped).toBe(false);
            expect(artifact.zone).toBe(player.battlefield);
            expect(game.pendingColourChoice).toBeNull();
            expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        } finally {
            gameEventManager.offCheck(preventSacrifice);
        }
    });
});

describe("Celestial Prism", () => {
    const prism = cardData.find(card => card.name === "Celestial Prism");
    let player: Player;

    beforeEach(() => {
        Game.init();
        player = game.addPlayer([]);
        startMainPhase();
    });

    test("casts for three generic mana", () => {
        const card = addTestCard(prism, player, player.hand);
        player.manaPool[ManaColour.Colourless] = 2;
        expect(playerActionManager.getCardActions(card, player)).toHaveLength(0);
        player.manaPool[ManaColour.G] = 1;
        playerActionManager.getCardActions(card, player)[0].perform(player);
        passPriorityRound();
        expect(player.battlefield.objects[0]).toMatchObject({ card: card.card, types: [CardType.Artifact], tapped: false });
        expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
    });

    test.each(cardColours)("pays two and taps to add one %s mana", colour => {
        const artifact = addTestCard(prism, player, player.battlefield);
        player.manaPool[ManaColour.U] = 1;
        expect(playerActionManager.getCardActions(artifact, player)).toHaveLength(0);
        player.manaPool[ManaColour.R] = 1;
        playerActionManager.getCardActions(artifact, player)[0].perform(player);

        expect(artifact.tapped).toBe(true);
        expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        expect(game.stack.objects).toHaveLength(0);
        expect(game.pendingColourChoice.player).toBe(player);
        game.pendingColourChoice.submit(player, colour);
        expect(player.manaPool[ManaColour[colour]]).toBe(1);
        expect(player.manaPool.reduce((sum, amount) => sum + amount, 0)).toBe(1);
        expect(artifact.zone).toBe(player.battlefield);

        player.manaPool[ManaColour.Colourless] = 2;
        expect(playerActionManager.getCardActions(artifact, player)).toHaveLength(0);
    });
});

describe("Braingeyser", () => {
    const def = cardData.find(card => card.name === "Braingeyser");
    let caster: Player;
    let opponent: Player;
    let card: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        card = addTestCard(def, caster, caster.hand);
    });

    test("requires two blue mana and draws the chosen number for the targeted player", () => {
        caster.manaPool[ManaColour.G] = 3;
        caster.manaPool[ManaColour.U] = 1;
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        caster.manaPool[ManaColour.U] = 2;
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingSpellXChoice.max).toBe(3);
        game.pendingSpellXChoice.submit(caster, 2);
        const targeting = game.pendingTargeter;
        expect(targeting.validateTargets([])).toBe(false);
        expect(targeting.validateTargets([addTestCard(cardData[FOREST], opponent, opponent.battlefield)])).toBe(false);
        expect(targeting.validateTargets([caster])).toBe(true);
        targeting.onTargeted([opponent]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(caster.manaPool[ManaColour.G]).toBe(1);

        const drawn = opponent.library.getTopXCards(2).reverse().map(object => object.card);
        const hand = opponent.hand.objects.map(object => object.card);
        const casterHandSize = caster.hand.objects.length;
        passPriorityRound();
        expect(opponent.hand.objects.map(object => object.card)).toEqual([...hand, ...drawn]);
        expect(caster.hand.objects).toHaveLength(casterHandSize);
        expect(caster.graveyard.objects.at(-1)?.card).toBe(card.card);
    });

    test("X = 0 still costs {U}{U} and requires a player target", () => {
        caster.manaPool[ManaColour.U] = 2;
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingSpellXChoice.max).toBe(0);
        game.pendingSpellXChoice.submit(caster, 0);
        expect(game.pendingTargeter.validateTargets([])).toBe(false);
        game.pendingTargeter.onTargeted([caster]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        const library = [...caster.library.objects];
        passPriorityRound();
        expect(caster.library.objects).toEqual(library);
        expect(caster.graveyard.objects.at(-1)?.card).toBe(card.card);
    });
});

describe("Blue Elemental Blast", () => {
    const blast = cardData.find(card => card.name === "Blue Elemental Blast");
    const goblins = cardData[MONS_GOBLIN_RAIDERS];
    let caster: Player;
    let opponent: Player;
    let card: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        card = addTestCard(blast, caster, caster.hand);
        caster.manaPool[ManaColour.U] = 1;
    });

    test("pays {U} to counter a red spell and leaves the red permanent alone", () => {
        const permanent = addTestCard(goblins, opponent, opponent.battlefield);
        const red = addTestCard(goblins, opponent, opponent.hand);
        const green = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, green)).toBe(true);
        expect(game.stack.spellCast(opponent, red)).toBe(true);
        const [greenSpell, redSpell] = game.stack.objects;

        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingSpellModeChoice.options).toEqual([
            { text: "Counter target red spell.", enabled: true },
            { text: "Destroy target red permanent.", enabled: true },
        ]);
        game.pendingSpellModeChoice.submit(caster, 0);
        expect(game.pendingTargeter.validateTargets([permanent])).toBe(false);
        expect(game.pendingTargeter.validateTargets([greenSpell])).toBe(false);
        game.pendingTargeter.onTargeted([redSpell]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);

        passPriorityRound();
        expect(game.stack.objects).toEqual([greenSpell]);
        expect(opponent.battlefield.objects).toEqual([permanent]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([red.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
    });

    test("offers destruction only when a red permanent is the only legal target", () => {
        const green = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        const permanent = addTestCard(goblins, caster, caster.battlefield);
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingSpellModeChoice.options.map(option => option.enabled)).toEqual([false, true]);
        game.pendingSpellModeChoice.submit(caster, 1);
        expect(game.pendingTargeter.validateTargets([green])).toBe(false);
        game.pendingTargeter.onTargeted([permanent]);
        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([permanent.card, card.card]);
    });

    test.each([0, 1])("rechecks the target's colour when mode %i resolves", mode => {
        const red = addTestCard(goblins, opponent, opponent.hand);
        let target: CardObject;
        if (mode === 0) {
            expect(game.stack.spellCast(opponent, red)).toBe(true);
            target = game.stack.objects[0] as Spell;
        } else {
            target = moveTestCard(red, opponent.battlefield);
        }
        expect(game.stack.spellCast(caster, card, [target], 0, mode)).toBe(true);
        const purelace = addTestCard(cardData.find(def => def.name === "Purelace"), opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, purelace, [target])).toBe(true);
        game.stack.resolveAll();

        expect(opponent.battlefield.objects.map(object => object.card)).toEqual([red.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
    });
});

describe("Animate Artifact", () => {
    const animate = cardData.find(card => card.name === "Animate Artifact");
    const prism = cardData.find(card => card.name === "Celestial Prism");
    let caster: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
    });

    function enchant(target: Permanent, def = animate) {
        const card = addTestCard(def, caster, caster.hand);
        expect(game.stack.spellCast(caster, card, [target])).toBe(true);
        passPriorityRound();
        return caster.battlefield.objects.find(permanent => permanent.card === card.card);
    }

    test("casts for {3}{U} and animates an opponent's artifact without changing control or abilities", () => {
        startMainPhase();
        const artifact = addTestCard(prism, opponent, opponent.battlefield);
        const bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const aura = addTestCard(animate, caster, caster.hand);
        caster.manaPool[ManaColour.Colourless] = 4;
        expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);
        caster.manaPool[ManaColour.Colourless] = 3;
        caster.manaPool[ManaColour.U] = 1;
        playerActionManager.getCardActions(aura, caster)[0].perform(caster);
        expect(game.pendingTargeter.validateTargets([bear])).toBe(false);
        game.pendingTargeter.onTargeted([artifact]);
        passPriorityRound();
        expect(caster.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        expect(artifact).toMatchObject({ controller: opponent, power: 3, toughness: 3, types: [CardType.Artifact, CardType.Creature] });
        expect(artifact.abilities[0].def.isManaAbility).toBe(true);
        expect(artifact.canPayTapCost).toBe(false);

        const strength = enchant(artifact, cardData.find(card => card.name === "Holy Strength"));
        expect(artifact).toMatchObject({ power: 4, toughness: 5 });
        const [animation] = caster.battlefield.objects;
        moveTestCard(animation, caster.graveyard);
        expect(artifact.types).toEqual([CardType.Artifact]);
        expect(artifact.canPayTapCost).toBe(true);
        expect(caster.graveyard.objects.map(card => card.card)).toContain(strength.card);
    });

    test("leaves an existing artifact creature's power and toughness alone", () => {
        startMainPhase();
        const creature = addTestCard({ ...prism, types: [CardType.Artifact, CardType.Creature], power: 1, toughness: 4 }, caster, caster.battlefield);
        expect(enchant(creature).attachedTo).toBe(creature);
        expect(creature).toMatchObject({ power: 1, toughness: 4 });
    });

    test("a zero-mana artifact becomes 0/0 and goes to the graveyard with its Aura", () => {
        startMainPhase();
        const artifact = addTestCard(cardData.find(card => card.name === "Black Lotus"), opponent, opponent.battlefield);
        enchant(artifact);
        expect(opponent.graveyard.objects.map(card => card.card)).toContain(artifact.card);
        expect(caster.graveyard.objects.map(card => card.def)).toContain(animate);
    });

    test("an established artifact can attack and leaves combat when the last animation ends", () => {
        const artifact = addTestCard(prism, caster, caster.battlefield);
        startMainPhase();
        const first = enchant(artifact);
        const second = enchant(artifact);
        const fresh = addTestCard(prism, caster, caster.battlefield);
        enchant(fresh);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        expect(CombatManager.canAttack(fresh)).toBe(false);
        new PlayerActions.DeclareAttacker(artifact).perform(caster, [opponent]);
        expect(CombatManager.attackingCreatures.has(artifact)).toBe(true);
        moveTestCard(first, caster.graveyard);
        expect(artifact.power).toBe(3);
        expect(CombatManager.attackingCreatures.has(artifact)).toBe(true);
        moveTestCard(second, caster.graveyard);
        expect(CombatManager.attackingCreatures.has(artifact)).toBe(false);
    });
});

describe("Clone", () => {
    const clone = cardData.find(card => card.name === "Clone");
    let player: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        player = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
    });

    function cast(name: string, targets: (CardObject | Player)[] = []) {
        const card = addTestCard(cardData.find(def => def.name === name), player, player.hand);
        expect(game.stack.spellCast(player, card, targets)).toBe(true);
        return card.card;
    }

    function choose(original: Permanent) {
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        expect(game.pendingResolutionChoice.options).toContain(original);
        game.pendingResolutionChoice.submit(player, [original]);
    }

    function copy(original: Permanent) {
        const physical = cast("Clone");
        passPriorityRound();
        choose(original);
        return player.battlefield.objects.find(permanent => permanent.card === physical);
    }

    test("pays {3}{U}, needs no casting target, and goes to the graveyard at zero toughness", () => {
        const card = addTestCard(clone, player, player.hand);
        player.manaPool[ManaColour.Colourless] = 3;
        expect(playerActionManager.getCardActions(card, player)).toHaveLength(0);
        player.manaPool[ManaColour.U] = 1;
        playerActionManager.getCardActions(card, player)[0].perform(player);
        expect(game.pendingTargeter).toBeFalsy();
        expect(game.pendingOptionalChoice).toBeNull();
        expect(player.manaPool.every(amount => !amount)).toBe(true);
        passPriorityRound();
        expect(player.graveyard.objects[0].card).toBe(card.card);
    });

    test("can decline even with a creature present", () => {
        addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const physical = cast("Clone");
        passPriorityRound();
        game.pendingOptionalChoice.submit(player, OptionalDecision.Decline);
        expect(player.graveyard.objects[0].card).toBe(physical);
    });

    test("copies an opposing Serra Angel's printed characteristics and native abilities", () => {
        const angel = addTestCard(cardData.find(def => def.name === "Serra Angel"), opponent, opponent.battlefield);
        cast("Holy Strength", [angel]);
        passPriorityRound();
        cast("Lance", [angel]);
        passPriorityRound();
        angel.tapped = true;
        angel.damageTaken = 3;
        expect(angel.hasKeyword(Keyword.FirstStrike)).toBe(true);
        expect(angel.power).toBe(5);

        const copyAngel = copy(angel);
        expect(copyAngel).toMatchObject({
            name: "Serra Angel", cost: angel.cost, colours: new Set(["W"]), subtypes: ["Angel"],
            power: 4, toughness: 4, damageTaken: 0, tapped: false, owner: player, controller: player,
            controlledSinceTurnStart: false, isCopy: true,
        });
        expect(copyAngel.hasKeyword(Keyword.Flying)).toBe(true);
        expect(copyAngel.hasKeyword(Keyword.Vigilance)).toBe(true);
        expect(copyAngel.hasKeyword(Keyword.FirstStrike)).toBe(false);
        expect(copyAngel.abilities.every(ability => ability.source === copyAngel)).toBe(true);
        moveTestCard(angel, opponent.graveyard);
        expect(copyAngel.power).toBe(4);
    });

    test("chooses from the battlefield at entry, including a creature with protection from blue", () => {
        const bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const other = addTestCard(cardData[MONS_GOBLIN_RAIDERS], player, player.battlefield);
        cast("Blue Ward", [bear]);
        passPriorityRound();
        cast("Clone");
        cast("Swords to Plowshares", [other]);
        passPriorityRound();
        passPriorityRound();
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        expect(game.pendingResolutionChoice.options).toEqual([bear]);
        game.pendingResolutionChoice.submit(player, [bear]);
        expect(player.battlefield.objects.at(-1).name).toBe("Grizzly Bears");
    });

    test("can choose an animated Celestial Prism and activate the copied noncreature artifact", () => {
        const prism = addTestCard(cardData.find(def => def.name === "Celestial Prism"), opponent, opponent.battlefield);
        cast("Animate Artifact", [prism]);
        passPriorityRound();
        const copied = copy(prism);
        expect(copied.types).toEqual([CardType.Artifact]);
        expect(copied.colours.size).toBe(0);
        player.manaPool[ManaColour.Colourless] = 2;
        playerActionManager.getCardActions(copied, player)[0].perform(player);
        game.pendingColourChoice.submit(player, "G");
        expect(player.manaPool[ManaColour.G]).toBe(1);
        expect(copied.tapped).toBe(true);
        expect(prism.tapped).toBe(false);
    });

    test("Purelace on the original and on the Clone spell apply independently of copy chains", () => {
        const bears = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        cast("Purelace", [bears]);
        passPriorityRound();
        const first = copy(bears);
        expect(first.colours).toEqual(new Set(["G"]));
        cast("Clone");
        cast("Purelace", [game.stack.objects.at(-1) as Spell]);
        passPriorityRound();
        passPriorityRound();
        choose(first);
        const white = player.battlefield.objects.at(-1);
        expect(white.colours).toEqual(new Set(["W"]));
        expect(copy(white).colours).toEqual(new Set(["G"]));
    });

    test("a copied Personal Incarnation dies for Clone's owner and Resurrection offers a fresh choice", () => {
        const original = addTestCard(cardData.find(def => def.name === "Personal Incarnation"), opponent, opponent.battlefield);
        const incarnation = copy(original);
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(incarnation));
        passPriorityRound();
        expect(player.life).toBe(10);
        expect(opponent.life).toBe(20);
        const grave = player.graveyard.objects[0];
        expect(grave.name).toBe("Clone");
        const bears = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        cast("Resurrection", [grave]);
        passPriorityRound();
        choose(bears);
        expect(player.battlefield.objects[0]).toMatchObject({ card: grave.card, name: "Grizzly Bears" });
    });
});

describe("Copy Artifact", () => {
    const def = cardData.find(card => card.name === "Copy Artifact");
    const lotus = cardData.find(card => card.name === "Black Lotus");
    let player: Player;
    let opponent: Player;

    beforeEach(() => {
        Game.init();
        player = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
    });

    test.each([false, true])("can enter as a plain enchantment (artifact available: %s)", available => {
        if (available)
            addTestCard(lotus, opponent, opponent.battlefield);
        const card = addTestCard(def, player, player.hand);
        player.manaPool[ManaColour.Colourless] = 1;
        expect(playerActionManager.getCardActions(card, player)).toHaveLength(0);
        player.manaPool[ManaColour.U] = 1;
        playerActionManager.getCardActions(card, player)[0].perform(player);
        expect(player.manaPool.every(amount => amount === 0)).toBe(true);
        expect(game.pendingTargeter).toBeFalsy();
        passPriorityRound();
        if (available)
            game.pendingOptionalChoice.submit(player, OptionalDecision.Decline);
        expect(game.hasPendingPlayerInput).toBe(false);
        expect(player.battlefield.objects[0]).toMatchObject({
            card: card.card, def, isCopy: false, types: [CardType.Enchantment], colours: new Set(["U"]),
        });
    });

    test("copies an opposing Black Lotus, adds enchantment, and sacrifices the copy for mana", () => {
        const original = addTestCard(lotus, opponent, opponent.battlefield);
        original.tapped = true;
        addTestCard(cardData[GRIZZLY_BEARS], player, player.battlefield);
        const card = addTestCard(def, player, player.hand);
        expect(game.stack.spellCast(player, card)).toBe(true);
        passPriorityRound();
        game.pendingOptionalChoice.submit(player, OptionalDecision.Accept);
        expect(game.pendingResolutionChoice.options).toEqual([original]);
        game.pendingResolutionChoice.submit(player, [original]);

        const copy = player.battlefield.objects.at(-1);
        expect(copy).toMatchObject({
            card: card.card, name: lotus.name, types: [CardType.Artifact, CardType.Enchantment],
            colours: new Set(), cost: original.cost, tapped: false, isCopy: true,
        });
        playerActionManager.getCardActions(copy, player)[0].perform(player);
        game.pendingColourChoice.submit(player, "U");
        expect(player.manaPool[ManaColour.U]).toBe(3);
        expect(player.graveyard.objects[0].def).toBe(def);
        expect(opponent.battlefield.objects).toEqual([original]);
        expect(original.types).toEqual([CardType.Artifact]);
    });
});

describe("Control Magic", () => {
    const def = cardData.find(card => card.name === "Control Magic");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        startMainPhase();
    });

    function enchant(player: Player, target: Permanent) {
        const card = addTestCard(def, player, player.hand);
        expect(game.stack.spellCast(player, card, [target])).toBe(true);
        passPriorityRound();
        return player.battlefield.objects.find(object => object.card === card.card);
    }

    test("pays {2}{U}{U}, takes the existing creature, and returns it when the Aura leaves", () => {
        const card = addTestCard(def, caster, caster.hand);
        const land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.U] = 4;
        creature.tapped = true;
        creature.damageTaken = 1;
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingTargeter.validateTargets([land])).toBe(false);
        game.pendingTargeter.onTargeted([creature]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(creature.controller).toBe(opponent);
        passPriorityRound();

        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(creature);
        expect(caster.battlefield.objects).toContain(creature);
        expect(opponent.battlefield.objects).toEqual([land]);
        expect(creature).toMatchObject({ controller: caster, owner: opponent, tapped: true, damageTaken: 1 });
        expect(creature.controlledSinceTurnStart).toBe(false);

        moveTestCard(aura, caster.graveyard);
        expect(creature.zone).toBe(opponent.battlefield);
        expect(creature.controller).toBe(opponent);
        expect(creature.retired).toBe(false);
    });

    test("simultaneously losing both Auras keeps an attacker under its original controller", () => {
        const older = enchant(caster, creature);
        const newer = enchant(opponent, creature);
        gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        new PlayerActions.DeclareAttacker(creature).perform(opponent, [caster]);
        expect(CombatManager.attackingCreatures.get(creature)).toBe(caster);

        gameEventManager.performSimultaneous([
            new GameEvent_DestroyPermanent(newer), new GameEvent_DestroyPermanent(older),
        ]);
        expect(creature.controller).toBe(opponent);
        expect(creature.controlledSinceTurnStart).toBe(true);
        expect(CombatManager.attackingCreatures.get(creature)).toBe(caster);
    });

    test("the newest attachment wins and reattaching restores the older effect", () => {
        const older = enchant(caster, creature);
        const newer = enchant(opponent, creature);
        expect(creature.controller).toBe(opponent);

        const other = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_AttachPermanent(newer, other));
        expect(creature.controller).toBe(caster);
        expect(other.controller).toBe(opponent);
        gameEventManager.addEvent(new GameEvent_AttachPermanent(older, other));
        expect(creature.controller).toBe(opponent);
        expect(other.controller).toBe(caster);

        moveTestCard(newer, opponent.graveyard);
        expect(other.controller).toBe(caster);
        older.controller = opponent;
        expect(other.controller).toBe(opponent);
        moveTestCard(older, caster.graveyard);
        expect(other.controller).toBe(caster);
    });
});

describe("Counterspell", () => {
    test("rejects a triggered ability and cannot counter a new casting of the same card", () => {
        Game.init();
        const player = game.addPlayer([]);
        const opponent = game.addPlayer([]);
        startMainPhase();
        const counter = addTestCard(cardData.find(def => def.name === "Counterspell"), player, player.hand);
        const incarnation = addTestCard(cardData.find(def => def.name === "Personal Incarnation"), opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(incarnation));
        const [trigger] = game.stack.objects;
        expect(trigger).toBeInstanceOf(StackAbility);
        expect(game.stack.spellCast(player, counter, [trigger])).toBe(false);

        const first = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
        expect(game.stack.spellCast(player, first)).toBe(true);
        const spell = game.stack.objects.at(-1) as Spell;
        expect(game.stack.spellCast(player, counter, [spell])).toBe(true);
        const returned = moveTestCard(spell, player.hand);
        expect(game.stack.spellCast(player, returned)).toBe(true);
        game.stack.resolveAll();
        expect(player.battlefield.objects.map(object => object.card)).toEqual([first.card]);
        expect(player.graveyard.objects.map(object => object.card)).toEqual([counter.card]);
    });

    test("pays {U}{U} to counter the chosen spell while another spell still resolves", () => {
        Game.init();
        const caster = game.addPlayer([]);
        const opponent = game.addPlayer([]);
        startMainPhase();
        const card = addTestCard(cardData.find(def => def.name === "Counterspell"), caster, caster.hand);
        caster.manaPool[ManaColour.U] = 2;
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        const bear = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
        const recall = addTestCard(cardData[ANCESTRAL_RECALL], opponent, opponent.hand);
        const libraryCard = addTestCard(cardData[FOREST], opponent, opponent.library);
        expect(game.stack.spellCast(opponent, bear)).toBe(true);
        expect(game.stack.spellCast(opponent, recall, [opponent])).toBe(true);
        const [bearSpell, recallSpell] = game.stack.objects;

        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingTargeter.validateTargets([opponent])).toBe(false);
        expect(game.pendingTargeter.validateTargets([bearSpell])).toBe(true);
        game.pendingTargeter.onTargeted([recallSpell]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        passPriorityRound();
        expect(game.stack.objects).toEqual([bearSpell]);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([recall.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([card.card]);
        passPriorityRound();
        expect(opponent.battlefield.objects[0].card).toBe(bear.card);
        expect(opponent.library.getTopCard()).toBe(libraryCard);
    });
});

describe("Creature Bond", () => {
    const def = cardData.find(card => card.name === "Creature Bond");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;
    let aura: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        startMainPhase();
        creature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        creature.controller = opponent;
        const card = addTestCard(def, caster, caster.hand);
        caster.manaPool[ManaColour.U] = 2;
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        game.pendingTargeter.onTargeted([creature]);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        passPriorityRound();
        aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(creature);
    });

    test("the Aura damages the last controller for the creature's modified toughness", () => {
        const armor = addTestCard(cardData.find(card => card.name === "Holy Strength"), opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, armor, [creature])).toBe(true);
        passPriorityRound();
        creature.damageTaken = 1;
        expect(creature.toughness).toBe(4);
        const hits: GameEvent_DealDamage[] = [];
        gameEventManager.onGamePerformed(GameEventType.DealDamage, (hit: GameEvent_DealDamage) => hits.push(hit));

        // 603.10a: All three permanents leave together, including the toughness bonus.
        gameEventManager.performSimultaneous([
            new GameEvent_DestroyPermanent(aura),
            new GameEvent_DestroyPermanent(opponent.battlefield.objects.find(object => object.card === armor.card)),
            new GameEvent_DestroyPermanent(creature),
        ]);
        chooseEarliestTimestamps(caster, creature);
        game.checkState();
        expect(game.stack.objects).toHaveLength(1);
        expect(game.stack.objects[0]).toMatchObject({ controller: caster, source: aura });
        expect(opponent.life).toBe(20);
        passPriorityRound();
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ source: aura, recipient: opponent, amount: 4 });
        expect(opponent.life).toBe(16);
        expect(caster.life).toBe(20);
    });

    test("ignores another creature dying and the enchanted creature being exiled", () => {
        const other = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DestroyPermanent(other));
        moveTestCard(creature, game.exile);
        expect(caster.graveyard.objects.at(-1).card).toBe(aura.card);
        expect(game.stack.objects).toHaveLength(0);
    });

    test("triggers at negative toughness and deals zero damage", () => {
        const hits = vi.fn();
        gameEventManager.onGamePerformed(GameEventType.DealDamage, hits);
        creature.toughness = -1;
        game.checkState();
        expect(game.stack.objects).toHaveLength(1);
        passPriorityRound();
        expect(hits).not.toHaveBeenCalled();
        expect(opponent.life).toBe(20);
    });
});

describe("Drain Power", () => {
    const def = cardData.find(card => card.name === "Drain Power");
    const island = cardData.find(card => card.name === "Island");
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

    test("costs {U}{U} and drains both the mana made during resolution and the target's unspent mana", () => {
        const firstIsland = addTestCard(island, caster, caster.battlefield);
        const swamp = addTestCard(cardData.find(card => card.name === "Swamp"), caster, caster.battlefield);
        expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
        const secondIsland = addTestCard(island, caster, caster.battlefield);
        const forest = addTestCard(cardData[FOREST], caster, caster.battlefield);
        forest.controller = opponent;
        const plains = addTestCard(cardData.find(card => card.name === "Plains"), opponent, opponent.battlefield);
        const mountain = addTestCard(cardData.find(card => card.name === "Mountain"), opponent, opponent.battlefield);
        const lotus = addTestCard(cardData.find(card => card.name === "Black Lotus"), opponent, opponent.battlefield);
        caster.manaPool[ManaColour.W] = 1;
        opponent.manaPool[ManaColour.Colourless] = 2;

        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        expect(game.pendingTargeter.validateTargets([forest])).toBe(false);
        game.pendingTargeter.onTargeted([opponent]);
        expect([firstIsland.tapped, secondIsland.tapped, forest.tapped]).toEqual([true, true, false]);

        gameEventManager.addEvent(new GameEvent_Advance());
        playerActionManager.getCardActions(mountain, opponent)[0].perform(opponent);
        expect(opponent.manaPool[ManaColour.R]).toBe(1);
        expect(forest.tapped).toBe(false);
        passPriorityRound();

        expect([forest.tapped, plains.tapped, mountain.tapped, swamp.tapped, lotus.tapped]).toEqual([true, true, true, false, false]);
        expect(opponent.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        expect(caster.manaPool).toEqual([2, 0, 0, 1, 1, 2]);
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.at(-1).card).toBe(card.card);
    });

    test("can target its caster and return all of that player's unspent mana", () => {
        const spare = addTestCard(island, caster, caster.battlefield);
        const forest = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
        caster.manaPool[ManaColour.U] = 2;
        caster.manaPool[ManaColour.W] = 1;

        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        game.pendingTargeter.onTargeted([caster]);
        passPriorityRound();

        expect(spare.tapped).toBe(true);
        expect(forest.tapped).toBe(false);
        expect(caster.manaPool).toEqual([1, 1, 0, 0, 0, 0]);
    });

    test("still transfers unspent mana from a player with no lands", () => {
        opponent.manaPool[ManaColour.B] = 2;
        caster.manaPool[ManaColour.U] = 2;
        playerActionManager.getCardActions(card, caster)[0].perform(caster);
        game.pendingTargeter.onTargeted([opponent]);
        passPriorityRound();

        expect(opponent.manaPool[ManaColour.B]).toBe(0);
        expect(caster.manaPool[ManaColour.B]).toBe(2);
    });
});

function castBlueSpellAtPermanent(caster: Player, def: CardDef, target: Permanent, mana: number, illegalTarget: CardObject) {
    const card = addTestCard(def, caster, caster.hand);
    caster.manaPool[ManaColour.U] = mana - 1;
    expect(playerActionManager.getCardActions(card, caster)).toHaveLength(0);
    caster.manaPool[ManaColour.U] = mana;
    playerActionManager.getCardActions(card, caster)[0].perform(caster);
    expect(game.pendingTargeter.validateTargets([illegalTarget])).toBe(false);
    game.pendingTargeter.onTargeted([target]);
    expect(caster.manaPool[ManaColour.U]).toBe(0);
    passPriorityRound();
    return card;
}

describe("Feedback", () => {
    const def = cardData.find(card => card.name === "Feedback");
    const castle = cardData.find(card => card.name === "Castle");

    test("enchants an enchantment and damages the player whose upkeep triggered it", () => {
        Game.init();
        const caster = game.addPlayer(BASIC_DECK);
        const opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        const target = addTestCard(castle, opponent, opponent.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const card = castBlueSpellAtPermanent(caster, def, target, 3, creature);
        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(target);
        const hits: GameEvent_DealDamage[] = [];
        gameEventManager.onGamePerformed(GameEventType.DealDamage, (hit: GameEvent_DealDamage) => hits.push(hit));

        function beginNextUpkeep() {
            gameEventManager.addEvent(new GameEvent_GoToNextTurn());
            gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Upkeep));
        }

        beginNextUpkeep();
        expect(game.stack.objects[0]).toBeInstanceOf(StackAbility);
        expect(game.stack.objects[0]).toMatchObject({ source: aura, controller: caster });
        expect(opponent.life).toBe(20);
        target.controller = caster;
        passPriorityRound();
        expect(hits[0]).toMatchObject({ source: aura, recipient: opponent, amount: 1 });
        expect([caster.life, opponent.life]).toEqual([20, 19]);

        beginNextUpkeep();
        expect(game.stack.objects).toHaveLength(1);
        passPriorityRound();
        expect(hits[1]).toMatchObject({ source: aura, recipient: caster, amount: 1 });
        expect([caster.life, opponent.life]).toEqual([19, 19]);
        beginNextUpkeep();
        expect(game.stack.objects).toHaveLength(0);
    });
});

describe("Flight", () => {
    const def = cardData.find(card => card.name === "Flight");
    const island = cardData.find(card => card.name === BasicLandType.Island);

    test("grants flying for as long as it remains attached", () => {
        Game.init();
        const caster = game.addPlayer(BASIC_DECK);
        const opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const land = addTestCard(island, opponent, opponent.battlefield);
        const card = castBlueSpellAtPermanent(caster, def, creature, 1, land);
        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(creature);
        expect(creature.hasKeyword(Keyword.Flying)).toBe(true);

        moveTestCard(aura, caster.graveyard);
        expect(creature.hasKeyword(Keyword.Flying)).toBe(false);
    });
});

describe("Invisibility", () => {
    const def = cardData.find(card => card.name === "Invisibility");
    const island = cardData.find(card => card.name === BasicLandType.Island);

    test("allows Wall blockers and excludes even flying non-Walls", () => {
        Game.init();
        const caster = game.addPlayer(BASIC_DECK);
        const opponent = game.addPlayer(BASIC_DECK);
        const attacker = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const nonWall = addTestCard(cardData.find(card => card.name === "Air Elemental"), opponent, opponent.battlefield);
        const wall = addTestCard(cardData.find(card => card.name === "Wall of Swords"), opponent, opponent.battlefield);
        startMainPhase();
        const land = addTestCard(island, opponent, opponent.battlefield);
        const card = castBlueSpellAtPermanent(caster, def, attacker, 2, land);
        const aura = caster.battlefield.objects.find(object => object.card === card.card);
        expect(aura.attachedTo).toBe(attacker);

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        new PlayerActions.DeclareAttacker(attacker).perform(caster, [opponent]);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareBlockers));
        expect(CombatManager.canBlockAttacker(wall, attacker)).toBe(true);
        expect(CombatManager.canBlockAttacker(nonWall, attacker)).toBe(false);

        moveTestCard(aura, caster.graveyard);
        expect(CombatManager.canBlockAttacker(nonWall, attacker)).toBe(true);
    });
});

describe("Jump", () => {
    const def = cardData.find(card => card.name === "Jump");
    const island = cardData.find(card => card.name === BasicLandType.Island);

    test("gives its target flying until cleanup", () => {
        Game.init();
        const caster = game.addPlayer(BASIC_DECK);
        const opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const other = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const land = addTestCard(island, opponent, opponent.battlefield);
        const card = castBlueSpellAtPermanent(caster, def, creature, 1, land);
        expect(caster.graveyard.objects.at(-1).card).toBe(card.card);
        expect(creature.hasKeyword(Keyword.Flying)).toBe(true);
        expect(other.hasKeyword(Keyword.Flying)).toBe(false);

        gameEventManager.addEvent(new GameEvent_Cleanup(caster));
        expect(creature.hasKeyword(Keyword.Flying)).toBe(false);
    });
});
