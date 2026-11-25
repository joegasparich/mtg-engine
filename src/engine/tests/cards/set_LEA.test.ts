import playerActionManager from "@engine/actions/PlayerActionManager";
import type { CardObject,Permanent } from "@engine/GameObject";
import type { Zone } from "@engine/Zone";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_DealDamage,GameEvent_DeclareAttacker,GameEvent_GoToNextTurn,GameEvent_GoToStep } from "@engine/events";
import { GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,BASIC_DECK,FOREST,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { Keyword } from "~/defs";
import { cardData } from "~/index";

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
        expect(caster.battlefield.objects.find(object => object.card === aura.card)?.attachedTo).toBe(legalWall);
    });
});

describe("Black Ward", () => {
    const wardDef = cardData.find(card => card.name === "Black Ward");
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
        expect(game.pendingTargeter).toBeNull();
        expect(plains.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        const attachedWard = caster.battlefield.objects.find(object => object.card === ward.card);
        expect(attachedWard?.attachedTo).toBe(creature);
        expect(creature.abilities).toEqual([expect.objectContaining({ source: creature, grantedBy: attachedWard })]);

        const source = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: "{B}" }, opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(0);

        moveTestCard(attachedWard, caster.graveyard);
        expect(creature.abilities).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(1);
    });

    test("the grant follows reattachment and ends on detach or loss of the granting ability", () => {
        const attachedWard = castWard();
        const otherCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const [initialGrant] = creature.abilities;

        attachedWard.attachedTo = otherCreature;
        expect(creature.abilities).toHaveLength(0);
        expect(otherCreature.abilities).toEqual([expect.objectContaining({ source: otherCreature, grantedBy: attachedWard })]);
        expect(otherCreature.abilities).not.toContain(initialGrant);
        attachedWard.colours = new Set(["W", "B"]);
        game.checkState();
        expect(attachedWard.zone).toBe(caster.battlefield);

        attachedWard.attachedTo = undefined;
        expect(otherCreature.abilities).toHaveLength(0);
        attachedWard.attachedTo = otherCreature;
        expect(otherCreature.abilities).toHaveLength(1);

        attachedWard.abilities = attachedWard.abilities.slice(0, 1);
        expect(attachedWard.attachedTo).toBe(otherCreature);
        expect(otherCreature.abilities).toHaveLength(0);
    });

    test("its own protection keeps a black Black Ward attached until another grant applies", () => {
        const firstWard = castWard();
        firstWard.colours = new Set(["W", "B"]);
        game.checkState();
        expect(firstWard.attachedTo).toBe(creature);
        expect(firstWard.zone).toBe(caster.battlefield);

        ward = addTestCard(wardDef, caster, caster.hand);
        const secondWard = castWard();
        expect(secondWard.attachedTo).toBe(creature);
        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: firstWard.card }));
    });

    test("a separate protection grant from the same Aura can remove a black Black Ward", () => {
        ward = addTestCard({
            ...wardDef,
            abilities: [...wardDef.abilities, { parts: {
                AbilityPart_GrantAttachedAbility: {
                    grant: { parts: { AbilityPart_Protection: { colour: "B" } } },
                },
            } }],
        }, caster, caster.hand);
        const attachedWard = castWard();
        expect(creature.abilities).toHaveLength(2);

        attachedWard.colours = new Set(["W", "B"]);
        game.checkState();

        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: ward.card }));
        expect(creature.abilities).toHaveLength(0);
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
        expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 2, visibility: "private" });
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
