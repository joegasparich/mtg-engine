import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_GoToStep } from "@engine/events";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { ANCESTRAL_RECALL,BASIC_DECK } from "@engine/tests/testData";
import { cardData } from "~/index";

describe("Ancestral Recall", () => {
    let caster: Player;
    let opponent: Player;
    let island: Card;
    let recall: Card;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        island = new Card(cardData.find(card => card.name === "Island"), caster);
        recall = new Card(cardData[ANCESTRAL_RECALL], caster);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(island, caster.battlefield));
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, caster.hand));
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
        expect(game.stack.stack).toHaveLength(0);
        expect(resolveSpell).not.toHaveBeenCalled();

        request.onTargeted([target]);
        request.onTargeted([target]);

        expect(resolveSpell).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ card: recall, targets: [target] }));
        expect(game.pendingTargeter).toBeNull();
        expect(island.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(recall.zone).toBe(caster.graveyard);
        expect(caster.hand.cards).toHaveLength(target === caster ? 10 : 7);
        expect(opponent.hand.cards).toHaveLength(target === opponent ? 10 : 7);
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
        expect(opponent.hand.cards).toHaveLength(10);
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
        expect(opponent.hand.cards).toHaveLength(7);

        beginCasting().onTargeted([opponent]);
        expect(recall.zone).toBe(caster.graveyard);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(opponent.hand.cards).toHaveLength(10);
    });
});
