import Player from "../../Player";
import Game, {game} from "../../Game";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});


// TODO: Any cards that have non standard effects
test("Limited Edition Alpha");