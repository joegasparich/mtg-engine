import Player from "@engine/Player";
import Game, {game} from "@engine/Game";
import gameEventManager, {GameEventType} from "@engine/events/GameEventManager";
import {GameEvent_CastSpell, GameEvent_ChangeCardZone} from "@engine/events";
import Card from "@engine/Card";
import {cardData} from "~/index";
import {ANCESTRAL_RECALL, FOREST} from "@engine/tests/testData";
import {GameEvent_StartTargeting} from "@engine/events/GameEvent_StartTargeting";

let playerA: Player;
let playerB: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    playerA = game.addPlayer([]);
    playerB = game.addPlayer([]);
});


// TODO: Any cards that have non standard effects
describe("Ancestral Recall", () => {
    test("draws 3 cards", () => {
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));

        const recall = new Card(cardData[ANCESTRAL_RECALL], playerA);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, playerA.hand));

        const targetPlayerA = (event: GameEvent_StartTargeting) => event.targeter.onTargeted([playerA]);
        gameEventManager.onPerformed(GameEventType.StartTargeting, targetPlayerA);

        const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
        gameEventManager.addEvent(new GameEvent_CastSpell(playerA, recall));

        gameEventManager.offPerformed(GameEventType.StartTargeting, targetPlayerA);

        // Test stack resolved properly
        expect(cardEnteredStack).toHaveBeenCalledTimes(1);

        // Check card entered graveyard
        expect(playerA.graveyard.cards.length).toBe(1);
        expect(playerA.graveyard.cards[0]).toBe(recall);

        // Check effect resolved
        expect(playerA.hand.cards.length).toBe(3);
    });
    test("target opponent", () => {
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));

        const recall = new Card(cardData[ANCESTRAL_RECALL], playerA);
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, playerA.hand));

        const targetPlayerB = (event: GameEvent_StartTargeting) => event.targeter.onTargeted([playerB]);
        gameEventManager.onPerformed(GameEventType.StartTargeting, targetPlayerB);

        const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
        gameEventManager.addEvent(new GameEvent_CastSpell(playerA, recall));

        gameEventManager.offPerformed(GameEventType.StartTargeting, targetPlayerB);

        // Test stack resolved properly
        expect(cardEnteredStack).toHaveBeenCalledTimes(1);

        // Check card entered graveyard
        expect(playerA.graveyard.cards.length).toBe(1);
        expect(playerA.graveyard.cards[0]).toBe(recall);

        // Check effect resolved
        expect(playerB.hand.cards.length).toBe(3);
    });
});