import * as PIXI from "pixi.js";

import Player from "../Player";
import {UIPlayer} from "./UIPlayer";

export let pixi: PIXI.Application = null;

pixi = new PIXI.Application();
await pixi.init({ background: '#1099bb', resizeTo: window });
document.body.appendChild(pixi.canvas);
pixi.stage.eventMode = 'static';
pixi.stage.hitArea = pixi.screen;

const playerPositions = [
    new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2),
    new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2),
]
const playerRotations = [
    0,
    180
]

export default class UIRoot extends PIXI.Container {
    players: UIPlayer[] = [];
    playerToUIPlayer = new Map<Player, UIPlayer>();
    uiPlayerToPlayer = new Map<UIPlayer, Player>();

    constructor() {
        super();
    }

    onPlayerAdded(player: Player) {
        if (this.players.length >= playerPositions.length) {
            console.log("Already at max players!!")
            return;
        }

        const uiPlayer = new UIPlayer(player, playerPositions[this.players.length], playerRotations[this.players.length]);
        pixi.stage.addChild(uiPlayer);
        this.players.push(uiPlayer);
        this.playerToUIPlayer.set(player, uiPlayer);
        this.uiPlayerToPlayer.set(uiPlayer, player);
    }
}
