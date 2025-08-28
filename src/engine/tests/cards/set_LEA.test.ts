import Player from "@engine/Player";
import Game, {game} from "@engine/Game";

let playerA: Player;
let playerB: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    playerA = game.addPlayer([]);
    playerB = game.addPlayer([]);
});


// TODO: Any cards that have non standard effects
// describe("Ancestral Recall", () => {
//     test("draws 3 cards", () => {
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerA), playerA.library));
//
//         const recall = new Card(cardData[ANCESTRAL_RECALL], playerA);
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, playerA.hand));
//
//         const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
//         gameEventManager.addEvent(new GameEvent_CastSpell(playerA, recall, [playerA]));
//
//         // Test stack resolved properly
//         expect(cardEnteredStack).toHaveBeenCalledTimes(1);
//
//         // Check card entered graveyard
//         expect(playerA.graveyard.cards.length).toBe(1);
//         expect(playerA.graveyard.cards[0]).toBe(recall);
//
//         // Check effect resolved
//         expect(playerA.hand.cards.length).toBe(3);
//     });
//     test("target opponent", () => {
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(new Card(cardData[FOREST], playerB), playerB.library));
//
//         const recall = new Card(cardData[ANCESTRAL_RECALL], playerA);
//         gameEventManager.addEvent(new GameEvent_ChangeCardZone(recall, playerA.hand));
//
//         const cardEnteredStack = vi.spyOn(game.stack, "resolveSpell");
//         gameEventManager.addEvent(new GameEvent_CastSpell(playerA, recall, [playerB]));
//
//         // Test stack resolved properly
//         expect(cardEnteredStack).toHaveBeenCalledTimes(1);
//
//         // Check card entered graveyard
//         expect(playerA.graveyard.cards.length).toBe(1);
//         expect(playerA.graveyard.cards[0]).toBe(recall);
//
//         // Check effect resolved
//         expect(playerB.hand.cards.length).toBe(3);
//     });
// });