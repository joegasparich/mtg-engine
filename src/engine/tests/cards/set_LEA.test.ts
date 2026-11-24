import playerActionManager from "@engine/actions/PlayerActionManager";
import type { CardObject,Permanent } from "@engine/GameObject";
import type { Zone } from "@engine/Zone";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_GoToNextTurn,GameEvent_GoToStep } from "@engine/events";
import { GameEvent_Simple,GameEventType } from "@engine/events/GameEventManager";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,BASIC_DECK,FOREST,GRIZZLY_BEARS } from "@engine/tests/testData";
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
        const declaration = new GameEvent_Simple(GameEventType.DeclareAttacker, "Declaration", wall);
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
